import {
  ApolloClient,
  from,
  HttpLink,
  InMemoryCache,
  split,
} from '@apollo/client/core';
import { getMainDefinition } from '@apollo/client/utilities';
import { setContext } from '@apollo/client/link/context';
import { onError } from '@apollo/client/link/error';

export const API_HOSTNAME = 'api.warrior.well-played.gg/';

export const GQL_URL = API_HOSTNAME + 'graphql';

const link = split(
  ({ query }) => {
    const def = getMainDefinition(query);
    return (
      def.kind === 'OperationDefinition' && def.operation === 'subscription'
    );
  },
  from([
    setContext(async (operation, prevContext) => {
      let token: string | undefined;
      for (let i = 0; i < sessionStorage.length; ++i) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith('oidc.wp')) {
          const value = sessionStorage.getItem(key);
          if (value) {
            token = JSON.parse(value).tokens?.accessToken;
            break;
          }
        }
      }

      // TODO - get selected organization id from store and authorization token
      return {
        headers: {
          /*'organization-id':
            selectedOrganizationIdSubject.getValue() ?? undefined,
          authorization: token ? `Bearer ${token}` : undefined,*/
        },
      };
    }),
    onError((gqlErr) => {
      if (gqlErr.networkError) {
        console.error(gqlErr);
      }

      gqlErr.graphQLErrors?.forEach((error) => {
        if (error.message === 'No authorization token found') return;

        console.error(error);
      });

      return gqlErr.forward(gqlErr.operation);
    }),
    new HttpLink({
      uri: `https://` + GQL_URL,
    }),
  ]),
);

export const client = new ApolloClient({
  cache: new InMemoryCache(),
  link,
  defaultOptions: {
    watchQuery: {
      fetchPolicy: 'network-only',
      errorPolicy: 'all',
    },
    query: {
      fetchPolicy: 'network-only',
      errorPolicy: 'all',
    },
    mutate: {
      errorPolicy: 'all',
    },
  },
});
