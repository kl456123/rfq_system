import { ethers } from 'hardhat';
import { SupportedProvider } from '../../src/wallet_provider';
import { expect } from 'chai';
import { BigNumber } from 'bignumber.js';
import {
  LimitOrder,
  RfqOrder,
  OrderInfo,
  LimitOrderFields,
  RfqOrderFields,
  OrderBase,
} from '../../src/orders';
import { TestMintableERC20Token } from '../../typechain-types/contracts/test';
import { NativeOrdersSettlement } from '../../typechain-types/contracts/protocol';

export class NativeOrdersTestEnvironment {
  constructor(
    public readonly maker: string,
    public readonly taker: string,
    public readonly makerToken: TestMintableERC20Token,
    public readonly takerToken: TestMintableERC20Token,
    public readonly zeroEx: NativeOrdersSettlement,
    public readonly provider: SupportedProvider
  ) {}

  public async prepareBalancesForOrdersAsync(
    orders: LimitOrder[] | RfqOrder[],
    taker: string = this.taker
  ): Promise<void> {
    await this.makerToken.mint(
      this.maker,
      BigNumber.sum(
        ...(orders as OrderBase[]).map(order => order.makerAmount)
      ).toFixed(0)
    );
    await this.takerToken.mint(
      taker,
      BigNumber.sum(
        ...(orders as OrderBase[]).map(order =>
          order.takerAmount.plus(
            order instanceof LimitOrder ? order.takerTokenFeeAmount : 0
          )
        )
      ).toFixed(0)
    );
  }

  public async fillLimitOrderAsync(
    order: LimitOrder,
    opts: Partial<{
      fillAmount: BigNumber | number;
      taker: string;
      protocolFee: BigNumber | number;
    }> = {}
  ) {
    const { fillAmount, taker, protocolFee } = {
      taker: this.taker,
      fillAmount: order.takerAmount,
      ...opts,
    };
    await this.prepareBalancesForOrdersAsync([order], taker);
    return this.zeroEx
      .connect(this.provider.getSigner(taker))
      .fillLimitOrder(
        order.toSolidity(),
        await order.getSignatureWithProviderAsync(this.provider),
        new BigNumber(fillAmount).toFixed(0)
      );
  }

  public async fillRfqOrderAsync(
    order: RfqOrder,
    fillAmount: BigNumber | number = order.takerAmount,
    taker: string = this.taker
  ) {
    await this.prepareBalancesForOrdersAsync([order], taker);
    return this.zeroEx
      .connect(this.provider.getSigner(taker))
      .fillRfqOrder(
        order.toSolidity(),
        await order.getSignatureWithProviderAsync(this.provider),
        new BigNumber(fillAmount).toFixed(0)
      );
  }
}

function randomBytes(numBytes: number) {
  return ethers.utils.hexlify(ethers.utils.randomBytes(numBytes));
}

function randomBytes32() {
  return randomBytes(32);
}

function randomAddress() {
  return randomBytes(20);
}

function randomUint256() {
  return new BigNumber(randomBytes32());
}

export type Numberish = BigNumber | string | number;

/**
 *  * Generate a random integer between `min` and `max`, inclusive.
 *   */
export function getRandomInteger(min: Numberish, max: Numberish): BigNumber {
  const range = new BigNumber(max).minus(min);
  return getRandomPortion(range).plus(min);
}

/**
 *  * Generate a random integer between `0` and `total`, inclusive.
 *   */
export function getRandomPortion(total: Numberish): BigNumber {
  return new BigNumber(total)
    .times(Math.random())
    .integerValue(BigNumber.ROUND_HALF_UP);
}

/**
 * Generate a random limit order.
 */
export function getRandomLimitOrder(
  fields: Partial<LimitOrderFields> = {}
): LimitOrder {
  return new LimitOrder({
    makerToken: randomAddress(),
    takerToken: randomAddress(),
    makerAmount: getRandomInteger('1e18', '100e18'),
    takerAmount: getRandomInteger('1e6', '100e6'),
    takerTokenFeeAmount: getRandomInteger('0.01e18', '1e18'),
    maker: randomAddress(),
    taker: randomAddress(),
    sender: randomAddress(),
    feeRecipient: randomAddress(),
    pool: randomBytes32(),
    expiry: new BigNumber(Math.floor(Date.now() / 1000 + 60)),
    salt: new BigNumber(randomUint256()),
    ...fields,
  });
}

/**
 * Generate a random RFQ order.
 */
export function getRandomRfqOrder(
  fields: Partial<RfqOrderFields> = {}
): RfqOrder {
  return new RfqOrder({
    makerToken: randomAddress(),
    takerToken: randomAddress(),
    makerAmount: getRandomInteger('1e18', '100e18'),
    takerAmount: getRandomInteger('1e6', '100e6'),
    maker: randomAddress(),
    txOrigin: randomAddress(),
    pool: randomBytes32(),
    expiry: new BigNumber(Math.floor(Date.now() / 1000 + 60)),
    salt: new BigNumber(randomUint256()),
    ...fields,
  });
}

/**
 * Asserts the fields of an OrderInfo object.
 */
export function assertOrderInfoEquals(
  actual: OrderInfo,
  expected: OrderInfo
): void {
  expect(actual.status, 'Order status').to.eq(expected.status);
  expect(actual.orderHash, 'Order hash').to.eq(expected.orderHash);
  expect(actual.takerTokenFilledAmount, 'Order takerTokenFilledAmount').to.eq(
    expected.takerTokenFilledAmount
  );
}

/**
 * Creates an order expiry field.
 */
export function createExpiry(deltaSeconds = 60): BigNumber {
  return new BigNumber(Math.floor(Date.now() / 1000) + deltaSeconds);
}

interface LimitOrderFilledAmounts {
  makerTokenFilledAmount: BigNumber;
  takerTokenFilledAmount: BigNumber;
  takerTokenFeeFilledAmount: BigNumber;
}

/**
 * Computes the maker, taker, and taker token fee amounts filled for
 * the given limit order.
 */
export function computeLimitOrderFilledAmounts(
  order: LimitOrder,
  takerTokenFillAmount: BigNumber = order.takerAmount,
  takerTokenAlreadyFilledAmount: BigNumber = new BigNumber(0)
): LimitOrderFilledAmounts {
  const fillAmount = BigNumber.min(
    order.takerAmount,
    takerTokenFillAmount,
    order.takerAmount.minus(takerTokenAlreadyFilledAmount)
  );
  const makerTokenFilledAmount = fillAmount
    .times(order.makerAmount)
    .div(order.takerAmount)
    .integerValue(BigNumber.ROUND_DOWN);
  const takerTokenFeeFilledAmount = fillAmount
    .times(order.takerTokenFeeAmount)
    .div(order.takerAmount)
    .integerValue(BigNumber.ROUND_DOWN);
  return {
    makerTokenFilledAmount,
    takerTokenFilledAmount: fillAmount,
    takerTokenFeeFilledAmount,
  };
}

interface RfqOrderFilledAmounts {
  makerTokenFilledAmount: BigNumber;
  takerTokenFilledAmount: BigNumber;
}

/**
 * Computes the maker and taker amounts filled for the given RFQ order.
 */
export function computeRfqOrderFilledAmounts(
  order: RfqOrder,
  takerTokenFillAmount: BigNumber = order.takerAmount,
  takerTokenAlreadyFilledAmount: BigNumber = new BigNumber(0)
): RfqOrderFilledAmounts {
  const fillAmount = BigNumber.min(
    order.takerAmount,
    takerTokenFillAmount,
    order.takerAmount.minus(takerTokenAlreadyFilledAmount)
  );
  const makerTokenFilledAmount = fillAmount
    .times(order.makerAmount)
    .div(order.takerAmount)
    .integerValue(BigNumber.ROUND_DOWN);
  return {
    makerTokenFilledAmount,
    takerTokenFilledAmount: fillAmount,
  };
}
