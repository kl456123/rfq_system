import { AddressZero as NULL_ADDRESS } from '@ethersproject/constants';
import { utils } from 'ethers';
import {
  Signature,
  SignatureType,
  eip712SignTypedDataWithProviderAsync,
  ethSignHashWithProviderAsync,
} from './signature_utils';
import {
  getTypeHash,
  createExchangeProxyEIP712Domain,
  EIP712_DOMAIN_PARAMETERS,
  getExchangeProxyEIP712Hash,
  EIP712TypedData,
} from './eip712_utils';
import { BigNumber } from 'bignumber.js';
import { BigNumber as BigNumberEther } from 'ethers';
import { SupportedProvider } from '../src/wallet_provider';

const Zero = new BigNumber(0);

export enum OrderStatus {
  Invalid = 0,
  Fillable = 1,
  Filled = 2,
  Cancelled = 3,
  Expired = 4,
}

export interface OrderInfo {
  status: OrderStatus;
  orderHash: string;
  takerTokenFilledAmount: BigNumberEther;
}

export interface OtcOrderInfo {
  status: OrderStatus;
  orderHash: string;
}

const COMMON_ORDER_DEFAULT_VALUES = {
  makerToken: NULL_ADDRESS,
  takerToken: NULL_ADDRESS,
  makerAmount: Zero,
  takerAmount: Zero,
  maker: NULL_ADDRESS,
  taker: NULL_ADDRESS,
  chainId: 1,
  verifyingContract: '',
};

const LIMIT_ORDER_DEFAULT_VALUES = {
  ...COMMON_ORDER_DEFAULT_VALUES,
  takerTokenFeeAmount: Zero,
  sender: NULL_ADDRESS,
  feeRecipient: NULL_ADDRESS,
  expiry: Zero,
  pool: utils.hexZeroPad('0x', 32),
  salt: Zero,
};
const RFQ_ORDER_DEFAULT_VALUES = {
  ...COMMON_ORDER_DEFAULT_VALUES,
  txOrigin: NULL_ADDRESS,
  expiry: Zero,
  pool: utils.hexZeroPad('0x', 32),
  salt: Zero,
};
const OTC_ORDER_DEFAULT_VALUES = {
  ...COMMON_ORDER_DEFAULT_VALUES,
  txOrigin: NULL_ADDRESS,
  expiryAndNonce: Zero,
};

export type BigNumberable = BigNumber | number | string;

export function bnToBytes32(value: BigNumberable): string {
  const bn = new BigNumber(value);
  if (!bn.isInteger()) {
    throw new Error('bnToBytes32: value must be an integer');
  }
  return `0x${new BigNumber(bn).toString(16).padStart(64, '0')}`;
}

export type CommonOrderFields = typeof COMMON_ORDER_DEFAULT_VALUES;
export type LimitOrderFields = typeof LIMIT_ORDER_DEFAULT_VALUES;
export type RfqOrderFields = typeof RFQ_ORDER_DEFAULT_VALUES;
export type OtcOrderFields = typeof OTC_ORDER_DEFAULT_VALUES;
export type NativeOrder = RfqOrder | LimitOrder;

export abstract class OrderBase {
  public makerToken: string;
  public takerToken: string;
  public makerAmount: BigNumber;
  public takerAmount: BigNumber;
  public maker: string;
  public taker: string;
  public chainId: number;
  public verifyingContract: string;

  protected constructor(fields: Partial<CommonOrderFields> = {}) {
    const _fields = { ...COMMON_ORDER_DEFAULT_VALUES, ...fields };
    this.makerToken = _fields.makerToken;
    this.takerToken = _fields.takerToken;
    this.makerAmount = _fields.makerAmount;
    this.takerAmount = _fields.takerAmount;
    this.maker = _fields.maker;
    this.taker = _fields.taker;
    this.chainId = _fields.chainId;
    this.verifyingContract = _fields.verifyingContract;
  }

  public abstract getStructHash(): string;
  public abstract getEIP712TypedData(): EIP712TypedData;
  public abstract willExpire(secondsFromNow: number): boolean;

  public getHash(): string {
    return getExchangeProxyEIP712Hash(
      this.getStructHash(),
      this.chainId,
      this.verifyingContract
    );
  }

  public async getSignatureWithProviderAsync(
    provider: SupportedProvider,
    type: SignatureType = SignatureType.EIP712,
    signer: string = this.maker
  ): Promise<string> {
    switch (type) {
      case SignatureType.EIP712:
        return eip712SignTypedDataWithProviderAsync(
          this.getEIP712TypedData(),
          signer,
          provider
        );
      case SignatureType.EthSign:
        return ethSignHashWithProviderAsync(this.getHash(), signer, provider);
      default:
        throw new Error(`Cannot sign with signature type: ${type}`);
    }
  }

  public getSignatureWithKey(
    key: string,
    type: SignatureType = SignatureType.EIP712
  ): Signature {
    switch (type) {
      case SignatureType.EIP712:
        return eip712SignTypedDataWithKey(this.getEIP712TypedData(), key);
      case SignatureType.EthSign:
        return ethSignHashWithKey(this.getHash(), key);
      default:
        throw new Error(`Cannot sign with signature type: ${type}`);
    }
  }
}

export class RfqOrder extends OrderBase {
  public static readonly STRUCT_NAME = 'RfqOrder';
  public static readonly STRUCT_ABI = [
    { type: 'address', name: 'makerToken' },
    { type: 'address', name: 'takerToken' },
    { type: 'uint128', name: 'makerAmount' },
    { type: 'uint128', name: 'takerAmount' },
    { type: 'address', name: 'maker' },
    { type: 'address', name: 'taker' },
    { type: 'address', name: 'txOrigin' },
    { type: 'bytes32', name: 'pool' },
    { type: 'uint64', name: 'expiry' },
    { type: 'uint256', name: 'salt' },
  ];
  public static readonly TYPE_HASH = getTypeHash(
    RfqOrder.STRUCT_NAME,
    RfqOrder.STRUCT_ABI
  );

  public txOrigin: string;
  public pool: string;
  public salt: BigNumber;
  public expiry: BigNumber;

  constructor(fields: Partial<RfqOrderFields> = {}) {
    const _fields = { ...RFQ_ORDER_DEFAULT_VALUES, ...fields };
    super(_fields);
    this.txOrigin = _fields.txOrigin;
    this.pool = _fields.pool;
    this.salt = _fields.salt;
    this.expiry = _fields.expiry;
  }

  public clone(fields: Partial<RfqOrderFields> = {}): RfqOrder {
    return new RfqOrder({
      makerToken: this.makerToken,
      takerToken: this.takerToken,
      makerAmount: this.makerAmount,
      takerAmount: this.takerAmount,
      maker: this.maker,
      taker: this.taker,
      txOrigin: this.txOrigin,
      pool: this.pool,
      expiry: this.expiry,
      salt: this.salt,
      chainId: this.chainId,
      verifyingContract: this.verifyingContract,
      ...fields,
    });
  }

  public toSolidity() {
    return {
      makerToken: this.makerToken,
      takerToken: this.takerToken,
      makerAmount: this.makerAmount.toFixed(0),
      takerAmount: this.takerAmount.toFixed(0),
      maker: this.maker,
      taker: this.taker,
      txOrigin: this.txOrigin,
      pool: this.pool,
      expiry: this.expiry.toFixed(0),
      salt: this.salt.toFixed(0),
    };
  }

  public getStructHash(): string {
    return utils.keccak256(
      utils.defaultAbiCoder.encode(
        [
          'bytes32',
          'address',
          'address',
          'uint256',
          'uint256',
          'address',
          'address',
          'address',
          'bytes32',
          'uint64',
          'uint256',
        ],
        [
          RfqOrder.TYPE_HASH,
          this.makerToken,
          this.takerToken,
          this.makerAmount.toFixed(0),
          this.takerAmount.toFixed(0),
          this.maker,
          this.taker,
          this.txOrigin,
          this.pool,
          this.expiry.toFixed(0),
          this.salt.toFixed(0),
        ]
      )
    );
  }

  public getEIP712TypedData(): EIP712TypedData {
    return {
      types: {
        [RfqOrder.STRUCT_NAME]: RfqOrder.STRUCT_ABI,
      },
      domain: createExchangeProxyEIP712Domain(
        this.chainId,
        this.verifyingContract
      ) as any,
      primaryType: RfqOrder.STRUCT_NAME,
      message: {
        makerToken: this.makerToken,
        takerToken: this.takerToken,
        makerAmount: this.makerAmount.toString(),
        takerAmount: this.takerAmount.toString(),
        maker: this.maker,
        taker: this.taker,
        txOrigin: this.txOrigin,
        pool: this.pool,
        expiry: this.expiry.toString(),
        salt: this.salt.toFixed(0),
      },
    };
  }

  public willExpire(secondsFromNow = 0): boolean {
    const millisecondsInSecond = 1000;
    const currentUnixTimestampSec = new BigNumber(
      Date.now() / millisecondsInSecond
    ).integerValue();
    return this.expiry.isLessThan(currentUnixTimestampSec.plus(secondsFromNow));
  }
}

export class LimitOrder extends OrderBase {
  public static readonly STRUCT_NAME = 'LimitOrder';
  public static readonly STRUCT_ABI = [
    { type: 'address', name: 'makerToken' },
    { type: 'address', name: 'takerToken' },
    { type: 'uint128', name: 'makerAmount' },
    { type: 'uint128', name: 'takerAmount' },
    { type: 'uint128', name: 'takerTokenFeeAmount' },
    { type: 'address', name: 'maker' },
    { type: 'address', name: 'taker' },
    { type: 'address', name: 'sender' },
    { type: 'address', name: 'feeRecipient' },
    { type: 'bytes32', name: 'pool' },
    { type: 'uint64', name: 'expiry' },
    { type: 'uint256', name: 'salt' },
  ];
  public static readonly TYPE_HASH = getTypeHash(
    LimitOrder.STRUCT_NAME,
    LimitOrder.STRUCT_ABI
  );

  public takerTokenFeeAmount: BigNumber;
  public sender: string;
  public feeRecipient: string;
  public pool: string;
  public salt: BigNumber;
  public expiry: BigNumber;

  constructor(fields: Partial<LimitOrderFields> = {}) {
    const _fields = { ...LIMIT_ORDER_DEFAULT_VALUES, ...fields };
    super(_fields);
    this.takerTokenFeeAmount = _fields.takerTokenFeeAmount;
    this.sender = _fields.sender;
    this.feeRecipient = _fields.feeRecipient;
    this.pool = _fields.pool;
    this.salt = _fields.salt;
    this.expiry = _fields.expiry;
  }

  public clone(fields: Partial<LimitOrderFields> = {}): LimitOrder {
    return new LimitOrder({
      makerToken: this.makerToken,
      takerToken: this.takerToken,
      makerAmount: this.makerAmount,
      takerAmount: this.takerAmount,
      takerTokenFeeAmount: this.takerTokenFeeAmount,
      maker: this.maker,
      taker: this.taker,
      sender: this.sender,
      feeRecipient: this.feeRecipient,
      pool: this.pool,
      expiry: this.expiry,
      salt: this.salt,
      chainId: this.chainId,
      verifyingContract: this.verifyingContract,
      ...fields,
    });
  }

  public toSolidity() {
    return {
      makerToken: this.makerToken,
      takerToken: this.takerToken,
      makerAmount: this.makerAmount.toFixed(0),
      takerAmount: this.takerAmount.toFixed(0),
      takerTokenFeeAmount: this.takerTokenFeeAmount.toFixed(0),
      maker: this.maker,
      taker: this.taker,
      sender: this.sender,
      feeRecipient: this.feeRecipient,
      pool: this.pool,
      expiry: this.expiry.toFixed(0),
      salt: this.salt.toFixed(0),
    };
  }

  public getStructHash(): string {
    return utils.keccak256(
      utils.concat([
        LimitOrder.TYPE_HASH,
        utils.hexZeroPad(this.makerToken, 32),
        utils.hexZeroPad(this.takerToken, 32),
        bnToBytes32(this.makerAmount),
        bnToBytes32(this.takerAmount),
        bnToBytes32(this.takerTokenFeeAmount),
        utils.hexZeroPad(this.maker, 32),
        utils.hexZeroPad(this.taker, 32),
        utils.hexZeroPad(this.sender, 32),
        utils.hexZeroPad(this.feeRecipient, 32),
        utils.hexZeroPad(this.pool, 32),
        bnToBytes32(this.expiry),
        bnToBytes32(this.salt),
      ])
    );
  }

  public getEIP712TypedData(): EIP712TypedData {
    return {
      types: {
        [LimitOrder.STRUCT_NAME]: LimitOrder.STRUCT_ABI,
      },
      domain: createExchangeProxyEIP712Domain(
        this.chainId,
        this.verifyingContract
      ) as any,
      primaryType: LimitOrder.STRUCT_NAME,
      message: {
        makerToken: this.makerToken,
        takerToken: this.takerToken,
        makerAmount: this.makerAmount.toString(),
        takerAmount: this.takerAmount.toString(),
        takerTokenFeeAmount: this.takerTokenFeeAmount.toString(),
        maker: this.maker,
        taker: this.taker,
        sender: this.sender,
        feeRecipient: this.feeRecipient,
        pool: this.pool,
        expiry: this.expiry.toString(),
        salt: this.salt.toFixed(0),
      },
    };
  }

  public willExpire(secondsFromNow = 0): boolean {
    const millisecondsInSecond = 1000;
    const currentUnixTimestampSec = new BigNumber(
      Date.now() / millisecondsInSecond
    ).integerValue();
    return this.expiry.isLessThan(currentUnixTimestampSec.plus(secondsFromNow));
  }
}
