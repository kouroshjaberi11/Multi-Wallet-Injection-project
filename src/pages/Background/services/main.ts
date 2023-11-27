import { wrapStore } from 'webext-redux';
import { initializeStore, ReduxStoreType, RootState } from '../redux-slices';
import BaseService from './base';
import Config from '../../../exconfig';
import { decodeJSON } from '../utils';
import { initialState as initialNetworkState } from '../redux-slices/network';
import { initialState as initialTransactionsState } from '../redux-slices/transactions';

export interface MainServiceManagerServicesMap {
  [key: string]: BaseService<any>;
}

export interface MainServiceManagerProps {
  services: MainServiceManagerServicesMap;
}

export default class MainServiceManager extends BaseService<never> {
  store: ReduxStoreType;
  services?: MainServiceManagerServicesMap;

  private constructor(readonly name: string, readonly state: Partial<RootState>) {
    super();
    state.network = initialNetworkState;
    state.transactions = initialTransactionsState;
    this.store = initializeStore(state as RootState, this);
    wrapStore(this.store);

  }

  static async helper(name: string) {
    let state: Partial<RootState> = {};
    const version = await chrome.storage.local.get(['version']);
    const res = await chrome.storage.local.get(['state'])
    if (version.key === Config.stateVersion) {
      const stateFromStorage = decodeJSON(res.key || '') as any;
      if (
        stateFromStorage &&
        stateFromStorage.network &&
        stateFromStorage.network.activeNetwork.chainID ===
        initialNetworkState.activeNetwork.chainID
      ) {
        state = stateFromStorage;
      }
    }

    return new this(name, state);

  }

  init = async (props: MainServiceManagerProps) => {
    this.services = props.services;
  };

  static async create(
    name: string,
    serviceInitializer: (
      mainServiceManager: MainServiceManager
    ) => Promise<MainServiceManagerServicesMap>
  ) {
    const mainServiceManager = await this.helper(name);

    await mainServiceManager.init({
      services: await serviceInitializer(mainServiceManager),
    });

    return mainServiceManager;
  }

  getService = (name: string): BaseService<any> => {
    if (!this.services) throw new Error('No services initialised');
    return this.services[name];
  };

  _startService = async (): Promise<void> => {
    if (!this.services) throw new Error('No services initialised');
    Object.values(this.services).map((service) => service.startService());
  };
  _stopService = async (): Promise<void> => {
    if (!this.services) throw new Error('No services initialised');
    Object.values(this.services).map((service) => service.stopService());
  };
}
