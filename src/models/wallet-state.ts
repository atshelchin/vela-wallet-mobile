/**
 * Wallet state management using React Context.
 * Matches iOS WalletState.swift.
 */
import React, { createContext, useContext, useReducer, useCallback, type Dispatch } from 'react';
import type { Account } from './types';

// MARK: - State Shape

export interface WalletState {
  hasWallet: boolean;
  address: string;
  isConnectedToBrowser: boolean;
  accounts: Account[];
  activeAccountIndex: number;
}

const INITIAL_STATE: WalletState = {
  hasWallet: false,
  address: '',
  isConnectedToBrowser: false,
  accounts: [],
  activeAccountIndex: 0,
};

// MARK: - Actions

type WalletAction =
  | { type: 'SET_WALLET'; accounts: Account[]; activeIndex?: number }
  | { type: 'ADD_ACCOUNT'; account: Account }
  | { type: 'SWITCH_ACCOUNT'; index: number }
  | { type: 'SET_CONNECTED'; connected: boolean }
  | { type: 'LOGOUT' };

function walletReducer(state: WalletState, action: WalletAction): WalletState {
  switch (action.type) {
    case 'SET_WALLET': {
      const idx = action.activeIndex ?? 0;
      const account = action.accounts[idx];
      return {
        ...state,
        hasWallet: action.accounts.length > 0,
        accounts: action.accounts,
        activeAccountIndex: idx,
        address: account?.address ?? '',
      };
    }
    case 'ADD_ACCOUNT': {
      const accounts = [...state.accounts, action.account];
      const idx = accounts.length - 1;
      return {
        ...state,
        hasWallet: true,
        accounts,
        activeAccountIndex: idx,
        address: action.account.address,
      };
    }
    case 'SWITCH_ACCOUNT': {
      const account = state.accounts[action.index];
      if (!account) return state;
      return {
        ...state,
        activeAccountIndex: action.index,
        address: account.address,
      };
    }
    case 'SET_CONNECTED':
      return { ...state, isConnectedToBrowser: action.connected };
    case 'LOGOUT':
      return INITIAL_STATE;
    default:
      return state;
  }
}

// MARK: - Context

interface WalletContextValue {
  state: WalletState;
  dispatch: Dispatch<WalletAction>;
  activeAccount: Account | undefined;
}

export const WalletContext = createContext<WalletContextValue>({
  state: INITIAL_STATE,
  dispatch: () => {},
  activeAccount: undefined,
});

export function useWallet(): WalletContextValue {
  return useContext(WalletContext);
}

// MARK: - Provider Component

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(walletReducer, INITIAL_STATE);
  const activeAccount = state.accounts[state.activeAccountIndex];

  const value = React.useMemo(
    () => ({ state, dispatch, activeAccount }),
    [state, activeAccount],
  );

  return React.createElement(WalletContext.Provider, { value }, children);
}

// MARK: - Utility

/** Shorten an address to "0x1234...abcd". */
export function shortAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
