// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.9;

import '../libs/LibNativeOrdersStorage.sol';
import '../libs/LibNativeOrder.sol';
import '../libs/LibNativeOrdersRichErrors.sol';
import './NativeOrdersInfo.sol';
import '../libs/LibRichErrors.sol';
import '../interface/INativeOrdersEvents.sol';

/// @dev Feature for cancelling limit and RFQ orders.
abstract contract NativeOrdersCancellation is
    INativeOrdersEvents,
    NativeOrdersInfo
{
    using LibRichErrors for bytes;

    /// @dev Highest bit of a uint256, used to flag cancelled orders.
    uint256 private constant HIGH_BIT = 1 << 255;

    constructor(address zeroExAddress) NativeOrdersInfo(zeroExAddress) {
        // solhint-disable no-empty-blocks
    }

    /// @dev Cancel a single limit order. The caller must be the maker or a valid order signer.
    ///      Silently succeeds if the order has already been cancelled.
    /// @param order The limit order.
    function cancelLimitOrder(LibNativeOrder.LimitOrder memory order) public {
        bytes32 orderHash = getLimitOrderHash(order);
        if (
            msg.sender != order.maker &&
            !isValidOrderSigner(order.maker, msg.sender)
        ) {
            LibNativeOrdersRichErrors
                .OnlyOrderMakerAllowed(orderHash, msg.sender, order.maker)
                .rrevert();
        }
        _cancelOrderHash(orderHash, order.maker);
    }

    /// @dev Cancel a single RFQ order. The caller must be the maker or a valid order signer.
    ///      Silently succeeds if the order has already been cancelled.
    /// @param order The RFQ order.
    function cancelRfqOrder(LibNativeOrder.RfqOrder memory order) public {
        bytes32 orderHash = getRfqOrderHash(order);
        if (
            msg.sender != order.maker &&
            !isValidOrderSigner(order.maker, msg.sender)
        ) {
            LibNativeOrdersRichErrors
                .OnlyOrderMakerAllowed(orderHash, msg.sender, order.maker)
                .rrevert();
        }
        _cancelOrderHash(orderHash, order.maker);
    }

    /// @dev Cancel multiple limit orders. The caller must be the maker or a valid order signer.
    ///      Silently succeeds if the order has already been cancelled.
    /// @param orders The limit orders.
    function batchCancelLimitOrders(LibNativeOrder.LimitOrder[] memory orders)
        public
    {
        for (uint256 i = 0; i < orders.length; ++i) {
            cancelLimitOrder(orders[i]);
        }
    }

    /// @dev Cancel multiple RFQ orders. The caller must be the maker or a valid order signer.
    ///      Silently succeeds if the order has already been cancelled.
    /// @param orders The RFQ orders.
    function batchCancelRfqOrders(LibNativeOrder.RfqOrder[] memory orders)
        public
    {
        for (uint256 i = 0; i < orders.length; ++i) {
            cancelRfqOrder(orders[i]);
        }
    }

    /// @dev Cancel a limit or RFQ order directly by its order hash.
    /// @param orderHash The order's order hash.
    /// @param maker The order's maker.
    function _cancelOrderHash(bytes32 orderHash, address maker) private {
        LibNativeOrdersStorage.Storage storage stor = LibNativeOrdersStorage
            .getStorage();
        // Set the high bit on the raw taker token fill amount to indicate
        // a cancel. It's OK to cancel twice.
        stor.orderHashToTakerTokenFilledAmount[orderHash] |= HIGH_BIT;

        emit OrderCancelled(orderHash, maker);
    }
}
