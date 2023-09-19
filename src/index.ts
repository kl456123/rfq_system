import { } from '';
import {
    CHAIN_ID,
    defaultHttpServiceWithRateLimiterConfig,
    ETHEREUM_RPC_URL,
    ETH_GAS_STATION_API_URL,
    META_TX_WORKER_MNEMONIC,
    META_TX_WORKER_REGISTRY,
    REDIS_URI,
    RFQM_MAKER_ASSET_OFFERINGS,
    RFQM_META_TX_SQS_URL,
    RFQM_WORKER_INDEX,
    RFQ_PROXY_ADDRESS,
    RFQ_PROXY_PORT,
    SWAP_QUOTER_OPTS,
} from './config';
import { logger } from './logger';




(async () => {
        // Build dependencies
        const config: HttpServiceConfig = {
            ...defaultHttpServiceWithRateLimiterConfig,
        };
        const connection = await getDBConnectionAsync();
        const rfqmService = await buildRfqmServiceAsync(connection, false);
        const configManager = new ConfigManager();
        await runHttpRfqmServiceAsync(rfqmService, configManager, config, connection);
    })().catch((error) => logger.error(error.stack));
