import React from 'react';
import ReactDOM from 'react-dom/client';
import {
  createNetworkConfig,
  SuiClientProvider,
  WalletProvider,
} from '@mysten/dapp-kit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@mysten/dapp-kit/dist/index.css';
import App from './App';
import './styles.css';

const queryClient = new QueryClient();
const suiNetworkRaw = (import.meta.env.VITE_SUI_NETWORK ?? 'mainnet').toLowerCase();
const suiNetwork =
  suiNetworkRaw === 'testnet' || suiNetworkRaw === 'devnet' ? suiNetworkRaw : 'mainnet';
const rpcUrl = import.meta.env.VITE_SUI_RPC_URL
  ?? (suiNetwork === 'mainnet'
    ? 'https://fullnode.mainnet.sui.io:443'
    : suiNetwork === 'testnet'
      ? 'https://fullnode.testnet.sui.io:443'
      : 'https://fullnode.devnet.sui.io:443');
const dappName = import.meta.env.VITE_DAPP_NAME ?? 'BlockBlock Booth';

const { networkConfig } = createNetworkConfig({
  mainnet: {
    url: suiNetwork === 'mainnet' ? rpcUrl : 'https://fullnode.mainnet.sui.io:443',
    network: 'mainnet',
  },
  testnet: {
    url: suiNetwork === 'testnet' ? rpcUrl : 'https://fullnode.testnet.sui.io:443',
    network: 'testnet',
  },
  devnet: {
    url: suiNetwork === 'devnet' ? rpcUrl : 'https://fullnode.devnet.sui.io:443',
    network: 'devnet',
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork={suiNetwork}>
        <WalletProvider autoConnect slushWallet={{ name: dappName }}>
          <App />
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
