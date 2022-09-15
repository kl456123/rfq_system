// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.9;

import '@openzeppelin/contracts/utils/cryptography/ECDSA.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '../libs/LibNativeOrdersStorage.sol';
import '../libs/LibNativeOrder.sol';
import '../libs/LibNativeOrdersRichErrors.sol';
import '../libs/LibRichErrors.sol';
import './NativeOrdersCancellation.sol';

contract NativeOrdersSettlement is NativeOrdersCancellation {
    using SafeERC20 for IERC20;

    using LibRichErrors for bytes;

    /// @dev Params for `_settleOrder()`.
    struct SettleOrderInfo {
        // Order hash.
        bytes32 orderHash;
        // Maker of the order.
        address maker;
        // The address holding the taker tokens.
        address payer;
        // Recipient of the maker tokens.
        address recipient;
        // Maker token.
        IERC20 makerToken;
        // Taker token.
        IERC20 takerToken;
        // Maker token amount.
        uint128 makerAmount;
        // Taker token amount.
        uint128 takerAmount;
        // Maximum taker token amount to fill.
        uint128 takerTokenFillAmount;
        // How much taker token amount has already been filled in this order.
        uint128 takerTokenFilledAmount;
    }

    /// @dev Params for `_fillLimitOrderPrivate()`
    struct FillLimitOrderPrivateParams {
        // The limit order.
        LibNativeOrder.LimitOrder order;
        // The order signature.
        bytes signature;
        // Maximum taker token to fill this order with.
        uint128 takerTokenFillAmount;
        // The order taker.
        address taker;
        // The order sender.
        address sender;
    }

    /// @dev Params for `_fillRfqOrderPrivate()`
    struct FillRfqOrderPrivateParams {
        LibNativeOrder.RfqOrder order;
        // The order signature.
        bytes signature;
        // Maximum taker token to fill this order with.
        uint128 takerTokenFillAmount;
        // The order taker.
        address taker;
        // Whether to use the Exchange Proxy's balance
        // of taker tokens.
        bool useSelfBalance;
        // The recipient of the maker tokens.
        address recipient;
    }

    // @dev Fill results returned by `_fillLimitOrderPrivate()` and
    ///     `_fillRfqOrderPrivate()`.
    struct FillNativeOrderResults {
        uint256 ethProtocolFeePaid;
        uint128 takerTokenFilledAmount;
        uint128 makerTokenFilledAmount;
        uint128 takerTokenFeeFilledAmount;
    }

    constructor() NativeOrdersCancellation(address(this)) {}

    /// @dev Fill a limit order. The taker and sender will be the caller.
    /// @param order The limit order. ETH protocol fees can be
    ///      attached to this call. Any unspent ETH will be refunded to
    ///      the caller.
    /// @param signature The order signature.
    /// @param takerTokenFillAmount Maximum taker token amount to fill this order with.
    /// @return takerTokenFilledAmount How much maker token was filled.
    /// @return makerTokenFilledAmount How much maker token was filled.
    function fillLimitOrder(
        LibNativeOrder.LimitOrder memory order,
        bytes memory signature,
        uint128 takerTokenFillAmount
    )
        public
        payable
        returns (uint128 takerTokenFilledAmount, uint128 makerTokenFilledAmount)
    {
        FillNativeOrderResults memory results = _fillLimitOrderPrivate(
            FillLimitOrderPrivateParams({
                order: order,
                signature: signature,
                takerTokenFillAmount: takerTokenFillAmount,
                taker: msg.sender,
                sender: msg.sender
            })
        );
        // LibNativeOrder.refundExcessProtocolFeeToSender(results.ethProtocolFeePaid);
        (takerTokenFilledAmount, makerTokenFilledAmount) = (
            results.takerTokenFilledAmount,
            results.makerTokenFilledAmount
        );
    }

    /// @dev Fill an RFQ order for up to `takerTokenFillAmount` taker tokens.
    ///      The taker will be the caller. ETH should be attached to pay the
    ///      protocol fee.
    /// @param order The RFQ order.
    /// @param signature The order signature.
    /// @param takerTokenFillAmount Maximum taker token amount to fill this order with.
    /// @return takerTokenFilledAmount How much maker token was filled.
    /// @return makerTokenFilledAmount How much maker token was filled.
    function fillRfqOrder(
        LibNativeOrder.RfqOrder memory order,
        bytes memory signature,
        uint128 takerTokenFillAmount
    )
        public
        returns (uint128 takerTokenFilledAmount, uint128 makerTokenFilledAmount)
    {
        FillNativeOrderResults memory results = _fillRfqOrderPrivate(
            FillRfqOrderPrivateParams({
                order: order,
                signature: signature,
                takerTokenFillAmount: takerTokenFillAmount,
                taker: msg.sender,
                useSelfBalance: false,
                recipient: msg.sender
            })
        );
        (takerTokenFilledAmount, makerTokenFilledAmount) = (
            results.takerTokenFilledAmount,
            results.makerTokenFilledAmount
        );
    }

    /// @dev Fill a limit order. Private variant. Does not refund protocol fees.
    /// @param params Function params.
    /// @return results Results of the fill.
    function _fillLimitOrderPrivate(FillLimitOrderPrivateParams memory params)
        private
        returns (FillNativeOrderResults memory results)
    {
        LibNativeOrder.OrderInfo memory orderInfo = getLimitOrderInfo(
            params.order
        );

        // Must be fillable.
        if (orderInfo.status != LibNativeOrder.OrderStatus.FILLABLE) {
            LibNativeOrdersRichErrors
                .OrderNotFillableError(
                    orderInfo.orderHash,
                    uint8(orderInfo.status)
                )
                .rrevert();
        }

        // Must be fillable by the taker.
        if (
            params.order.taker != address(0) &&
            params.order.taker != params.taker
        ) {
            LibNativeOrdersRichErrors
                .OrderNotFillableByTakerError(
                    orderInfo.orderHash,
                    params.taker,
                    params.order.taker
                )
                .rrevert();
        }

        // Must be fillable by the sender.
        if (
            params.order.sender != address(0) &&
            params.order.sender != params.sender
        ) {
            LibNativeOrdersRichErrors
                .OrderNotFillableBySenderError(
                    orderInfo.orderHash,
                    params.sender,
                    params.order.sender
                )
                .rrevert();
        }

        // Signature must be valid for the order.
        {
            address signer = ECDSA.recover(
                orderInfo.orderHash,
                params.signature
            );
            if (
                signer != params.order.maker &&
                !isValidOrderSigner(params.order.maker, signer)
            ) {
                LibNativeOrdersRichErrors
                    .OrderNotSignedByMakerError(
                        orderInfo.orderHash,
                        signer,
                        params.order.maker
                    )
                    .rrevert();
            }
        }

        // Pay the protocol fee.
        // results.ethProtocolFeePaid = _collectProtocolFee(params.order.pool);

        // Settle between the maker and taker.
        (
            results.takerTokenFilledAmount,
            results.makerTokenFilledAmount
        ) = _settleOrder(
            SettleOrderInfo({
                orderHash: orderInfo.orderHash,
                maker: params.order.maker,
                payer: params.taker,
                recipient: params.taker,
                makerToken: IERC20(params.order.makerToken),
                takerToken: IERC20(params.order.takerToken),
                makerAmount: params.order.makerAmount,
                takerAmount: params.order.takerAmount,
                takerTokenFillAmount: params.takerTokenFillAmount,
                takerTokenFilledAmount: orderInfo.takerTokenFilledAmount
            })
        );

        // Pay the fee recipient.
        if (params.order.takerTokenFeeAmount > 0) {
            results.takerTokenFeeFilledAmount =
                (results.takerTokenFilledAmount *
                    params.order.takerTokenFeeAmount) /
                params.order.takerAmount;

            params.order.takerToken.safeTransferFrom(
                params.taker,
                params.order.feeRecipient,
                uint256(results.takerTokenFeeFilledAmount)
            );
        }

        emit LimitOrderFilled(
            orderInfo.orderHash,
            params.order.maker,
            params.taker,
            params.order.feeRecipient,
            address(params.order.makerToken),
            address(params.order.takerToken),
            results.takerTokenFilledAmount,
            results.makerTokenFilledAmount,
            results.takerTokenFeeFilledAmount,
            results.ethProtocolFeePaid,
            params.order.pool
        );
    }

    /// @dev Fill an RFQ order. Private variant.
    /// @param params Function params.
    /// @return results Results of the fill.
    function _fillRfqOrderPrivate(FillRfqOrderPrivateParams memory params)
        private
        returns (FillNativeOrderResults memory results)
    {
        LibNativeOrder.OrderInfo memory orderInfo = getRfqOrderInfo(
            params.order
        );

        // Must be fillable.
        if (orderInfo.status != LibNativeOrder.OrderStatus.FILLABLE) {
            LibNativeOrdersRichErrors
                .OrderNotFillableError(
                    orderInfo.orderHash,
                    uint8(orderInfo.status)
                )
                .rrevert();
        }

        {
            LibNativeOrdersStorage.Storage storage stor = LibNativeOrdersStorage
                .getStorage();

            // Must be fillable by the tx.origin.
            if (
                params.order.txOrigin != tx.origin &&
                !stor.originRegistry[params.order.txOrigin][tx.origin]
            ) {
                LibNativeOrdersRichErrors
                    .OrderNotFillableByOriginError(
                        orderInfo.orderHash,
                        tx.origin,
                        params.order.txOrigin
                    )
                    .rrevert();
            }
        }

        // Must be fillable by the taker.
        if (
            params.order.taker != address(0) &&
            params.order.taker != params.taker
        ) {
            LibNativeOrdersRichErrors
                .OrderNotFillableByTakerError(
                    orderInfo.orderHash,
                    params.taker,
                    params.order.taker
                )
                .rrevert();
        }

        // Signature must be valid for the order.
        {
            address signer = ECDSA.recover(
                orderInfo.orderHash,
                params.signature
            );
            if (
                signer != params.order.maker &&
                !isValidOrderSigner(params.order.maker, signer)
            ) {
                LibNativeOrdersRichErrors
                    .OrderNotSignedByMakerError(
                        orderInfo.orderHash,
                        signer,
                        params.order.maker
                    )
                    .rrevert();
            }
        }

        // Settle between the maker and taker.
        (
            results.takerTokenFilledAmount,
            results.makerTokenFilledAmount
        ) = _settleOrder(
            SettleOrderInfo({
                orderHash: orderInfo.orderHash,
                maker: params.order.maker,
                payer: params.useSelfBalance ? address(this) : params.taker,
                recipient: params.recipient,
                makerToken: IERC20(params.order.makerToken),
                takerToken: IERC20(params.order.takerToken),
                makerAmount: params.order.makerAmount,
                takerAmount: params.order.takerAmount,
                takerTokenFillAmount: params.takerTokenFillAmount,
                takerTokenFilledAmount: orderInfo.takerTokenFilledAmount
            })
        );

        emit RfqOrderFilled(
            orderInfo.orderHash,
            params.order.maker,
            params.taker,
            address(params.order.makerToken),
            address(params.order.takerToken),
            results.takerTokenFilledAmount,
            results.makerTokenFilledAmount,
            params.order.pool
        );
    }

    /// @dev Settle the trade between an order's maker and taker.
    /// @param settleInfo Information needed to execute the settlement.
    /// @return takerTokenFilledAmount How much taker token was filled.
    /// @return makerTokenFilledAmount How much maker token was filled.
    function _settleOrder(SettleOrderInfo memory settleInfo)
        private
        returns (uint128 takerTokenFilledAmount, uint128 makerTokenFilledAmount)
    {
        // Clamp the taker token fill amount to the fillable amount.
        takerTokenFilledAmount = settleInfo.takerTokenFillAmount <
            (settleInfo.takerAmount - settleInfo.takerTokenFilledAmount)
            ? settleInfo.takerTokenFillAmount
            : (settleInfo.takerAmount - settleInfo.takerTokenFilledAmount);
        // Compute the maker token amount.
        // This should never overflow because the values are all clamped to
        // (2^128-1).
        makerTokenFilledAmount =
            (takerTokenFilledAmount * settleInfo.makerAmount) /
            settleInfo.takerAmount;

        if (takerTokenFilledAmount == 0 || makerTokenFilledAmount == 0) {
            // Nothing to do.
            return (0, 0);
        }

        // Update filled state for the order.
        LibNativeOrdersStorage.getStorage().orderHashToTakerTokenFilledAmount[
            settleInfo.orderHash
        ] =
            // OK to overwrite the whole word because we shouldn't get to this
            // function if the order is cancelled.
            settleInfo.takerTokenFilledAmount +
            takerTokenFilledAmount;

        if (settleInfo.payer == address(this)) {
            // Transfer this -> maker.
            settleInfo.takerToken.safeTransfer(
                settleInfo.maker,
                takerTokenFilledAmount
            );
        } else {
            settleInfo.takerToken.safeTransferFrom(
                settleInfo.payer,
                settleInfo.maker,
                takerTokenFilledAmount
            );
        }

        settleInfo.makerToken.safeTransferFrom(
            settleInfo.maker,
            settleInfo.recipient,
            makerTokenFilledAmount
        );
    }

    /// @dev Mark what tx.origin addresses are allowed to fill an order that
    ///      specifies the message sender as its txOrigin.
    /// @param origins An array of origin addresses to update.
    /// @param allowed True to register, false to unregister.
    function registerAllowedRfqOrigins(address[] memory origins, bool allowed)
        external
    {
        require(
            msg.sender == tx.origin,
            'NativeOrdersFeature/NO_CONTRACT_ORIGINS'
        );

        LibNativeOrdersStorage.Storage storage stor = LibNativeOrdersStorage
            .getStorage();

        for (uint256 i = 0; i < origins.length; i++) {
            stor.originRegistry[msg.sender][origins[i]] = allowed;
        }

        emit RfqOrderOriginsAllowed(msg.sender, origins, allowed);
    }
}
