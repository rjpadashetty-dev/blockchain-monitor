const { ethers } = require('ethers');

const provider = process.env.BLOCKCHAIN_RPC_URL ? new ethers.JsonRpcProvider(process.env.BLOCKCHAIN_RPC_URL) : null;
const chainEnabled = Boolean(provider);

async function getChainStatus() {
  if (!provider) return { enabled: false, network: 'local-fallback' };
  const network = await provider.getNetwork();
  const blockNumber = await provider.getBlockNumber();
  return { enabled: true, network: network.name || `chain-${network.chainId}`, chainId: Number(network.chainId), blockNumber };
}

async function sendNativeTransfer({ privateKey, toAddress, amount }) {
  if (!provider) throw new Error('BLOCKCHAIN_RPC_URL is not configured');
  if (!privateKey) throw new Error('Sender wallet is not configured for blockchain mode');
  const wallet = new ethers.Wallet(privateKey, provider);
  const tx = await wallet.sendTransaction({ to: toAddress, value: ethers.parseEther(String(amount)) });
  return { hash: tx.hash, from: wallet.address, to: toAddress, wait: () => tx.wait() };
}

async function getTransaction(hash) {
  if (!provider) return null;
  const tx = await provider.getTransaction(hash);
  const receipt = tx ? await provider.getTransactionReceipt(hash) : null;
  return { transaction: tx, receipt };
}

module.exports = { chainEnabled, getChainStatus, sendNativeTransfer, getTransaction };