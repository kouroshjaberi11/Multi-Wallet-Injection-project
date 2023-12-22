import {
  WindowRequestEvent,
  WindowListener,
  Window,
  WindowEthereum,
  WalletProvider,
} from './types';
import AAWindowProvider from './window-provider';

const provider = new AAWindowProvider({
  postMessage: (data: WindowRequestEvent) =>
    window.postMessage(data, window.location.origin),
  addEventListener: (fn: WindowListener) =>
    window.addEventListener('message', fn, false),
  removeEventListener: (fn: WindowListener) =>
    window.removeEventListener('message', fn, false),
  origin: window.location.origin,
});

Object.defineProperty(window, 'aa-provider', {
  value: provider,
  writable: false,
  configurable: false,
});

if (!(window as Window).walletRouter) {
  Object.defineProperty(window, 'walletRouter', {
    value: {
      currentProvider: (window as Window)['aa-provider'],
      lastInjectedProvider: window.ethereum,
      providers: [
        // deduplicate the providers array: https://medium.com/@jakubsynowiec/unique-array-values-in-javascript-7c932682766c
        ...new Set([
          (window as Window)['aa-provider'],
          // eslint-disable-next-line no-nested-ternary
          ...(window.ethereum
            ? // let's use the providers that has already been registered
            // This format is used by coinbase wallet
            Array.isArray(window.ethereum.providers)
              ? [...window.ethereum.providers, window.ethereum]
              : [window.ethereum]
            : []),
          (window as Window)['aa-provider'],
        ]),
      ],
      getProviderInfo(provider: WalletProvider) {
        return (
          provider.providerInfo || {
            label: 'Injected Provider',
            injectedNamespace: 'ethereum',
          }
        );
      },
      setSelectedProvider() { },
      addProvider(newProvider: WalletProvider) {
        if (!this.providers.includes(newProvider)) {
          this.providers.push(newProvider);
        }

        this.lastInjectedProvider = newProvider;
      },
    },
    writable: false,
    configurable: false,
  });
}

let cachedWindowEthereumProxy: WindowEthereum;
let cachedCurrentProvider: WalletProvider;

Object.defineProperty(window, 'ethereum', {
  get() {
    const walletRouter = (window as Window).walletRouter;

    if (!walletRouter) return undefined;

    if (
      cachedWindowEthereumProxy &&
      cachedCurrentProvider === walletRouter.currentProvider
    ) {
      return cachedWindowEthereumProxy;
    }
    cachedWindowEthereumProxy = new Proxy(walletRouter.currentProvider, {
      get(target, prop, receiver) {
        if (
          walletRouter &&
          !(prop in walletRouter.currentProvider) &&
          prop in walletRouter
        ) {
          // Uniswap MM connector checks the providers array for the MM provider and forces to use that
          // https://github.com/Uniswap/web3-react/blob/main/packages/metamask/src/index.ts#L57
          // as a workaround we need to remove this list for uniswap so the actual provider change can work after reload.
          // The same is true for `galaxy.eco`
          if (
            (window.location.href.includes('app.uniswap.org') ||
              window.location.href.includes('kwenta.io') ||
              window.location.href.includes('galxe.com')) &&
            prop === 'providers'
          ) {
            return null;
          }
          // let's publish the api of `window.walletRouter` also on `window.ethereum` for better discoverability

          // @ts-expect-error ts accepts symbols as index only from 4.4
          // https://stackoverflow.com/questions/59118271/using-symbol-as-object-key-type-in-typescript
          return window.walletRouter[prop];
        }

        return Reflect.get(target, prop, receiver);
      },
    });
    cachedCurrentProvider = walletRouter.currentProvider;

    return cachedWindowEthereumProxy;
  },
});

interface RequestArguments {
  readonly method: string;
  readonly params?: readonly unknown[] | object;
}

interface EIP1193Provider {
  request: (payload: {
    method: string;
    params?: unknown[] | object;
  }) => Promise<unknown>;
}

function announceProvider() {
  const info: EIP6963ProviderInfo = {
    uuid: '03226cc2-998e-42d2-9c97-cbbcdb8179af',
    name: 'Trampoline Wallet',
    icon: 'data:image/png;base64,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',
    rdns: 'io.erc4337', //TODO: Change this to an appropriate domain
  };

  window.dispatchEvent(
    new CustomEvent('eip6963:announceProvider', {
      detail: Object.freeze({
        info: { ...info },
        provider: provider,
      }),
    })
  );
}

window.addEventListener(
  'eip6963:requestProvider',
  (event: EIP6963RequestProviderEvent) => {
    announceProvider();
  }
);

announceProvider();
