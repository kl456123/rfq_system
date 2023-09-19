export enum ChainId {
    Mainnet = 1,
    Ropsten = 3,
    Rinkeby = 4,
    Kovan = 42,
    Ganache = 1337,
    BSC = 56,
    Polygon = 137,
    PolygonMumbai = 80001,
    Avalanche = 43114,
    Fantom = 250,
    Celo = 42220,
  }


export interface BaseHttpConfig {
      httpPort: number;
      httpIP: string;
      healthcheckHttpPort: number;
      healthcheckPath: string;
      httpKeepAliveTimeout: number;
      httpHeadersTimeout: number;
  }


export interface HttpServiceConfig extends BaseHttpConfig {
       ethereumRpcUrl: string;
       chainId: ChainId;
   }
