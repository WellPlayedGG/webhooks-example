import { Controller, Post, Req } from '@nestjs/common';
import { checkSignature } from '../../utils/check-signature';
import { Request } from 'express';
import { cleanEnv, str } from 'envalid';
import { REST, Routes } from 'discord.js';
import { graphql } from 'gql.tada';
import { client } from '../../apollo';

const GetPlayersQuery = graphql(`
  query GetPlayersQuery($ids: [ID!]!) {
    players(
      ids: $ids
      identityProviderProperties: []
      identityProviders: []
      page: {}
    ) {
      nodes {
        id
      }
    }
  }
`);

const IdpApiTokenMutation = graphql(`
  mutation IdpApiTokenMutation($id: ID!, $providerId: ID!) {
    accountIdentityGenerateAccessToken(
      accountId: $id
      identityProviderId: $providerId
    )
  }
`);

const IdpRefreshIdentityMutation = graphql(`
  mutation IdpRefreshIdentityMutation($id: ID!, $providerId: ID!) {
    accountIdentityRefresh(accountId: $id, identityProviderId: $providerId) {
      providerId
    }
  }
`);

const UpdateCustomFieldMutation = graphql(`
  mutation UpdateCustomField(
    $id: ID!
    $customField: String!
    $fieldValue: String!
  ) {
    updatePlayer(
      input: { customFields: [{ property: $customField, value: $fieldValue }] }
      id: $id
    ) {
      id
    }
  }
`);

const RetrieveTeamQuery = graphql(`
  query RetrieveTeamQuery($id: ID!) {
    tournamentTeam(teamId: $id, memberStatus: ACCEPTED) {
      id
      members {
        playerProfileId
      }
    }
  }
`);

@Controller('webhooks/well-played')
export class WellPlayedController {
  private readonly env = cleanEnv(process.env, {
    DISCORD_TOKEN: str({
      desc: 'Discord bot token, generated from the Discord Developer Portal',
    }),
    DISCORD_GUILD_ID: str({
      desc: 'Discord guild ID',
    }),
    WP_WEBHOOK_SECRET: str({
      desc: 'WellPlayed Webhook Secret used to verify the webhook, can be found on the WellPlayed console (webhooks management)',
    }),
    WP_APP_ID: str({
      desc: 'WellPlayed App ID, can be found on the WellPlayed console',
    }),
    WP_APP_SECRET: str({
      desc: 'WellPlayed App Secret, can be found on the WellPlayed console',
    }),
    WP_DISCORD_IDP_ID: str({
      desc: 'WellPlayed Discord Identity Provider ID, can be found on the WellPlayed console',
    }),
  });
  private discordRest = new REST({ version: '10' }).setToken(
    this.env.DISCORD_TOKEN,
  );

  constructor() {}

  @Post()
  async wellPlayedWebhookCall(@Req() request: Request) {
    checkSignature({
      request,
      secret: this.env.WP_WEBHOOK_SECRET,
    });

    const event = request.header('wp-webhook-event') as
      | undefined
      | 'TOURNAMENT_TEAM_DELETED'
      | 'TOURNAMENT_TEAM_DELETED_ADMIN'
      | 'TOURNAMENT_TEAM_STATUS_UPDATED'
      | 'TOURNAMENT_TEAM_CONFIRMATION_UPDATED'
      | 'TOURNAMENT_TEAM_ATTENDANCE_UPDATED';

    if (!event) {
      return;
    }

    const data = request.body as {
      id: string;
      tag: string;
      name: string;
      teamId: string;
      managerId: string;
      status:
        | 'NOT_ATTENDING'
        | 'NOT_VALID'
        | 'REGISTERED'
        | 'AWAITING_FOR_PAYMENT'
        | 'AWAITING_FOR_PRESENCE_CONFIRMATION'
        | 'CONFIRMED'
        | 'DENIED';
      tournamentId: string;
      createdAt: Date;
      updatedAt: Date;
    };

    const team = await client.query({
      query: RetrieveTeamQuery,
      variables: { id: data.teamId },
    });

    if (!team.data.tournamentTeam) {
      return;
    }

    const players = await client.query({
      query: GetPlayersQuery,
      variables: {
        ids: team.data.tournamentTeam.members.map(
          (member) => member.playerProfileId,
        ),
      },
    });

    for (const player of players.data.players.nodes) {
      await client.mutate({
        mutation: UpdateCustomFieldMutation,
        variables: {
          id: player.id,
          customField: 'exampleField',
          fieldValue: 'exampleValue',
        },
      });
    }

    const discordApiToken = await client.mutate({
      mutation: IdpApiTokenMutation,
      variables: {
        id: data.managerId,
        providerId: this.env.WP_DISCORD_IDP_ID,
      },
    });
    const discordId = (
      await client.mutate({
        mutation: IdpRefreshIdentityMutation,
        variables: {
          id: data.managerId,
          providerId: this.env.WP_DISCORD_IDP_ID,
        },
      })
    ).data.accountIdentityRefresh.providerId;
    switch (event) {
      case 'TOURNAMENT_TEAM_DELETED':
      case 'TOURNAMENT_TEAM_DELETED_ADMIN':
        await this.discordRest
          .delete(Routes.guildMember(this.env.DISCORD_GUILD_ID, discordId))
          .catch((e) => {
            console.error(e);
          });
        break;
      case 'TOURNAMENT_TEAM_STATUS_UPDATED':
      case 'TOURNAMENT_TEAM_CONFIRMATION_UPDATED':
      case 'TOURNAMENT_TEAM_ATTENDANCE_UPDATED':
        if (data.status === 'CONFIRMED') {
          await this.discordRest.put(
            Routes.guildMember(this.env.DISCORD_GUILD_ID, discordId),
            {
              body: {
                access_token: discordApiToken,
              },
            },
          );
          // You can even attach a group to a user here
        } else {
          await this.discordRest
            .delete(Routes.guildMember(this.env.DISCORD_GUILD_ID, discordId))
            .catch((e) => {
              console.error(e);
            });
        }
    }
  }
}
