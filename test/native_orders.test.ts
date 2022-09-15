import { time, loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs';
import { expect } from 'chai';
import { AddressZero as NULL_ADDRESS } from '@ethersproject/constants';
import { ethers } from 'hardhat';
import { TestMintableERC20Token } from '../typechain-types/contracts/test';
import { NativeOrdersSettlement } from '../typechain-types/contracts/protocol';
import { TestMintableERC20Token__factory } from '../typechain-types/factories/contracts/test';
import {
  WalletProvider,
  SupportedProvider,
  SignerWithAddress,
} from '../src/wallet_provider';
import {
  LimitOrderFields,
  LimitOrder,
  RfqOrderFields,
  RfqOrder,
  OrderStatus,
} from '../src/orders';
import {
  getRandomLimitOrder,
  getRandomRfqOrder,
  createExpiry,
  NativeOrdersTestEnvironment,
  assertOrderInfoEquals,
  computeLimitOrderFilledAmounts,
  computeRfqOrderFilledAmounts,
} from './utils/orders';
import { Signer } from '@ethersproject/abstract-signer';
import { BigNumber } from 'bignumber.js';
import { Wallet, BigNumber as BigNumberEther } from 'ethers';

describe('native orders', function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshopt in every test.
  async function deployFixture() {
    // Contracts are deployed using the first signer/account by default
    const [owner, taker, maker, noTaker, noMaker] = await ethers.getSigners();
    const provider = ethers.provider;

    const NativeOrdersSettlement = await ethers.getContractFactory(
      'NativeOrdersSettlement'
    );
    const nativeOrdersSettlement = await NativeOrdersSettlement.deploy();
    const walletProvider = new WalletProvider(provider);
    walletProvider.unlockAll([taker, maker, noTaker, noMaker, owner]);

    const tokenFactory = new TestMintableERC20Token__factory(owner);
    const makerToken = await tokenFactory.deploy('MakerToken', 'MT');
    const takerToken = await tokenFactory.deploy('TakerToken', 'TT');
    const max = ethers.constants.MaxUint256;

    // approve for taker and maker
    const exchangeAddr = nativeOrdersSettlement.address;
    await Promise.all(
      [maker, noMaker].map(a =>
        makerToken.connect(a).approve(exchangeAddr, max)
      )
    );
    await Promise.all(
      [taker, noTaker].map(a =>
        takerToken.connect(a).approve(exchangeAddr, max)
      )
    );

    const testEnv = new NativeOrdersTestEnvironment(
      maker.address,
      taker.address,
      makerToken,
      takerToken,
      nativeOrdersSettlement,
      walletProvider
    );

    return {
      nativeOrdersSettlement,
      owner,
      taker,
      maker,
      testEnv,
      takerToken,
      makerToken,
    };
  }

  let taker: string;
  let maker: string;
  let owner: string;
  let takerSigner: SignerWithAddress;
  let makerSigner: SignerWithAddress;
  let ownerSigner: SignerWithAddress;
  let verifyingContract: string;
  let takerToken: TestMintableERC20Token;
  let makerToken: TestMintableERC20Token;
  let exchange: NativeOrdersSettlement;
  let testEnv: NativeOrdersTestEnvironment;
  // let takerToken;

  beforeEach(async () => {
    const fixture = await loadFixture(deployFixture);
    taker = fixture.taker.address;
    maker = fixture.maker.address;
    owner = fixture.owner.address;
    takerSigner = fixture.taker;
    makerSigner = fixture.maker;
    ownerSigner = fixture.owner;

    takerToken = fixture.takerToken;
    makerToken = fixture.makerToken;
    verifyingContract = fixture.nativeOrdersSettlement.address;
    exchange = fixture.nativeOrdersSettlement;
    testEnv = fixture.testEnv;
  });

  function getTestLimitOrder(
    fields: Partial<LimitOrderFields> = {}
  ): LimitOrder {
    return getRandomLimitOrder({
      maker,
      verifyingContract,
      chainId: 31337,
      takerToken: takerToken.address,
      makerToken: makerToken.address,
      taker: NULL_ADDRESS,
      sender: NULL_ADDRESS,
      ...fields,
    });
  }

  function getTestRfqOrder(fields: Partial<RfqOrderFields> = {}): RfqOrder {
    return getRandomRfqOrder({
      maker,
      verifyingContract,
      chainId: 31337,
      takerToken: takerToken.address,
      makerToken: makerToken.address,
      txOrigin: taker,
      ...fields,
    });
  }

  describe('getLimitOrderHash()', () => {
    it('returns the correct hash', async () => {
      const order = getTestLimitOrder();
      const hash = await exchange.getLimitOrderHash(order.toSolidity());
      expect(hash).to.eq(order.getHash());
    });
  });
  describe('getRfqOrderHash()', () => {
    it('returns the correct hash', async () => {
      const order = getTestRfqOrder();
      const hash = await exchange.getRfqOrderHash(order.toSolidity());
      expect(hash).to.eq(order.getHash());
    });
  });

  async function assertExpectedFinalBalancesFromLimitOrderFillAsync(
    order: LimitOrder,
    opts: Partial<{
      takerTokenFillAmount: BigNumber;
      takerTokenAlreadyFilledAmount: BigNumber;
    }> = {}
  ): Promise<void> {
    const { takerTokenFillAmount, takerTokenAlreadyFilledAmount } = {
      takerTokenFillAmount: order.takerAmount,
      takerTokenAlreadyFilledAmount: new BigNumber(0),
      ...opts,
    };
    const {
      makerTokenFilledAmount,
      takerTokenFilledAmount,
      takerTokenFeeFilledAmount,
    } = computeLimitOrderFilledAmounts(
      order,
      takerTokenFillAmount,
      takerTokenAlreadyFilledAmount
    );
    const makerBalance = await takerToken.balanceOf(maker);
    const takerBalance = await makerToken.balanceOf(taker);
    const feeRecipientBalance = await takerToken.balanceOf(order.feeRecipient);
    expect(makerBalance).to.eq(takerTokenFilledAmount);
    expect(takerBalance).to.eq(makerTokenFilledAmount);
    expect(feeRecipientBalance).to.eq(takerTokenFeeFilledAmount);
  }

  describe('fillLimitOrder()', () => {
    it('can fully fill an order', async () => {
      const order = getTestLimitOrder();
      const receipt = await testEnv.fillLimitOrderAsync(order);
      assertOrderInfoEquals(
        await exchange.getLimitOrderInfo(order.toSolidity()),
        {
          orderHash: order.getHash(),
          status: OrderStatus.Filled,
          takerTokenFilledAmount: BigNumberEther.from(
            order.takerAmount.toString()
          ),
        }
      );
      await assertExpectedFinalBalancesFromLimitOrderFillAsync(order);
    });

    it('can partially fill an order', async () => {
      const order = getTestLimitOrder();
      const fillAmount = order.takerAmount.minus(1);
      const receipt = await testEnv.fillLimitOrderAsync(order, { fillAmount });
      assertOrderInfoEquals(
        await exchange.getLimitOrderInfo(order.toSolidity()),
        {
          orderHash: order.getHash(),
          status: OrderStatus.Fillable,
          takerTokenFilledAmount: BigNumberEther.from(fillAmount.toString()),
        }
      );
      await assertExpectedFinalBalancesFromLimitOrderFillAsync(order, {
        takerTokenFillAmount: fillAmount,
      });
    });

    it('cannot fill an expired order', async () => {
      const order = getTestLimitOrder({ expiry: createExpiry(-60) });
      const tx = testEnv.fillLimitOrderAsync(order);
      await expect(testEnv.fillLimitOrderAsync(order)).to.be.reverted;
    });

    it('cannot fill a cancelled order', async () => {
      const order = getTestLimitOrder();
      await exchange.connect(makerSigner).cancelLimitOrder(order.toSolidity());
      await expect(testEnv.fillLimitOrderAsync(order)).to.be.reverted;
    });
  });

  async function assertExpectedFinalBalancesFromRfqOrderFillAsync(
    order: RfqOrder,
    takerTokenFillAmount: BigNumber = order.takerAmount,
    takerTokenAlreadyFilledAmount: BigNumber = new BigNumber(0)
  ): Promise<void> {
    const { makerTokenFilledAmount, takerTokenFilledAmount } =
      computeRfqOrderFilledAmounts(
        order,
        takerTokenFillAmount,
        takerTokenAlreadyFilledAmount
      );
    const makerBalance = await takerToken.balanceOf(maker);
    const takerBalance = await makerToken.balanceOf(taker);
    expect(makerBalance).to.eq(takerTokenFilledAmount);
    expect(takerBalance).to.eq(makerTokenFilledAmount);
  }

  describe('fillRfqOrder()', () => {
    it('can fully fill an order', async () => {
      const order = getTestRfqOrder();
      const receipt = await testEnv.fillRfqOrderAsync(order);
      assertOrderInfoEquals(
        await exchange.getRfqOrderInfo(order.toSolidity()),
        {
          orderHash: order.getHash(),
          status: OrderStatus.Filled,
          takerTokenFilledAmount: BigNumberEther.from(
            order.takerAmount.toFixed(0)
          ),
        }
      );
      await assertExpectedFinalBalancesFromRfqOrderFillAsync(order);
    });

    it('can partially fill an order', async () => {
      const order = getTestRfqOrder();
      const fillAmount = order.takerAmount.minus(1);
      const receipt = await testEnv.fillRfqOrderAsync(order, fillAmount);
      assertOrderInfoEquals(
        await exchange.getRfqOrderInfo(order.toSolidity()),
        {
          orderHash: order.getHash(),
          status: OrderStatus.Fillable,
          takerTokenFilledAmount: BigNumberEther.from(fillAmount.toString()),
        }
      );
      await assertExpectedFinalBalancesFromRfqOrderFillAsync(order, fillAmount);
    });
  });

  describe('cancelLimitOrder()', async () => {
    it('can cancel an unfilled order', async () => {
      const order = getTestLimitOrder();
      const receipt = await exchange
        .connect(makerSigner)
        .cancelLimitOrder(order.toSolidity());
      const { status } = await exchange.getLimitOrderInfo(order.toSolidity());
      expect(status).to.eq(OrderStatus.Cancelled);
    });
  });

  describe('cancelRfqOrder()', async () => {
    it('can cancel an unfilled order', async () => {
      const order = getTestRfqOrder();
      const receipt = await exchange
        .connect(makerSigner)
        .cancelRfqOrder(order.toSolidity());
      const { status } = await exchange.getRfqOrderInfo(order.toSolidity());
      expect(status).to.eq(OrderStatus.Cancelled);
    });
  });
});
