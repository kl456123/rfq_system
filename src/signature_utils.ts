import { EIP712TypedData } from './eip712_utils';
import { SupportedProvider } from './wallet_provider';

/**
 * Valid signature types on the Exchange Proxy.
 */
export enum SignatureType {
  Illegal = 0,
  Invalid = 1,
  EIP712 = 2,
  EthSign = 3,
}

/**
 * Represents a raw EC signature.
 */
export interface ECSignature {
  v: number;
  r: string;
  s: string;
}

/**
 * A complete signature on the Exchange Proxy.
 */
export interface Signature extends ECSignature {
  signatureType: SignatureType;
}

/**
 * ABI definition for the `Signature` struct.
 */
export const SIGNATURE_ABI = [
  { name: 'signatureType', type: 'uint8' },
  { name: 'v', type: 'uint8' },
  { name: 'r', type: 'bytes32' },
  { name: 's', type: 'bytes32' },
];

/**
 * Sign a typed data object with the EIP712 signature type on a provider.
 */
export async function eip712SignTypedDataWithProviderAsync(
  data: EIP712TypedData,
  signerAddr: string,
  provider: SupportedProvider
): Promise<string> {
  const signer = provider.getSigner(signerAddr);
  const rpcSig = await signer._signTypedData(
    data.domain,
    data.types,
    data.message
  );
  return rpcSig;
}

/**
 * Sign a hash with the EthSign signature type on a provider.
 */
export async function ethSignHashWithProviderAsync(
  hash: string,
  signerAddr: string,
  provider: SupportedProvider
): Promise<string> {
  const signer = provider.getSigner(signerAddr);
  const rpcSig = await signer.signMessage(hash);
  return rpcSig;
}
