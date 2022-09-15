import { utils, constants } from 'ethers';
export interface EIP712Domain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: string;
}

export type EIP712_STRUCT_ABI = Array<{ type: string; name: string }>;

export const EIP712_DOMAIN_PARAMETERS = [
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' },
  { name: 'verifyingContract', type: 'address' },
];

const EXCHANGE_PROXY_EIP712_DOMAIN_DEFAULT = {
  chainId: 1,
  verifyingContract: constants.AddressZero,
  name: 'Exchange',
  version: '1.0.0',
};

const EXCHANGE_PROXY_DOMAIN_TYPEHASH = utils.keccak256(
  utils.hexlify(
    Buffer.from(
      [
        'EIP712Domain(',
        [
          'string name',
          'string version',
          'uint256 chainId',
          'address verifyingContract',
        ].join(','),
        ')',
      ].join('')
    )
  )
);

/**
 * Create an exchange proxy EIP712 domain.
 */
export function createExchangeProxyEIP712Domain(
  chainId?: number,
  verifyingContract?: string
): EIP712Domain {
  return {
    ...EXCHANGE_PROXY_EIP712_DOMAIN_DEFAULT,
    ...(chainId ? { chainId } : {}),
    ...(verifyingContract ? { verifyingContract } : {}),
  };
}

/**
 * Get the hash of the exchange proxy EIP712 domain.
 */
export function getExchangeProxyEIP712DomainHash(
  chainId?: number,
  verifyingContract?: string
): string {
  const domain = createExchangeProxyEIP712Domain(chainId, verifyingContract);
  return utils.solidityKeccak256(
    ['bytes32', 'bytes32', 'bytes32', 'uint256', 'bytes32'],
    [
      EXCHANGE_PROXY_DOMAIN_TYPEHASH,
      utils.keccak256(utils.hexlify(Buffer.from(domain.name))),
      utils.keccak256(utils.hexlify(Buffer.from(domain.version))),
      domain.chainId,
      utils.hexZeroPad(domain.verifyingContract, 32),
    ]
  );
}

/**
 * Compute a complete EIP712 hash given a struct hash.
 */
export function getExchangeProxyEIP712Hash(
  structHash: string,
  chainId?: number,
  verifyingContract?: string
): string {
  return utils.keccak256(
    utils.concat([
      '0x1901',
      getExchangeProxyEIP712DomainHash(chainId, verifyingContract),
      structHash,
    ])
  );
}

/**
 * Compute the type hash of an EIP712 struct given its ABI.
 */
export function getTypeHash(
  structName: string,
  abi: EIP712_STRUCT_ABI
): string {
  return utils.keccak256(
    utils.hexlify(
      Buffer.from(
        [
          `${structName}(`,
          abi.map(a => `${a.type} ${a.name}`).join(','),
          ')',
        ].join('')
      )
    )
  );
}

export interface EIP712Parameter {
  name: string;
  type: string;
}

export interface EIP712Types {
  [key: string]: EIP712Parameter[];
}

export type EIP712ObjectValue = string | number | EIP712Object;

export interface EIP712Object {
  [key: string]: EIP712ObjectValue;
}

export interface EIP712TypedData {
  types: EIP712Types;
  domain: EIP712Object;
  message: EIP712Object;
  primaryType: string;
}
