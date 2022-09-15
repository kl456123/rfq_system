import { ethers, Wallet, Signer } from 'ethers';
import { logger } from './logger';

export interface SupportedProvider {
  getSigner(accountAddress: string): SignerWithAddress;
}

export interface SignerWithAddress extends Signer {
  readonly address: string;
  signMessage(message: string | ethers.utils.Bytes): Promise<string>;
  _signTypedData(
    ...params: Parameters<ethers.providers.JsonRpcSigner['_signTypedData']>
  ): Promise<string>;
}

export class WalletProvider implements SupportedProvider {
  protected walletByAddress: Record<string, SignerWithAddress> = {};
  constructor(public provider: ethers.providers.BaseProvider) {}

  public listAccounts() {
    return Object.keys(this.walletByAddress);
  }

  public unlock(passwd: string | SignerWithAddress) {
    let wallet;
    if (typeof passwd === 'string') {
      wallet = new Wallet(passwd, this.provider);
    } else {
      wallet = passwd;
    }
    const accountAddress = wallet.address;
    if (this.has(accountAddress)) {
      logger.warn(`${accountAddress} is unlocked alreadly!`);
      return;
    }
    this.walletByAddress[accountAddress.toLowerCase()] = wallet;
  }
  public unlockAll(passwds: string[] | SignerWithAddress[]) {
    passwds.forEach(passwd => this.unlock(passwd));
  }

  public has(accountAddress: string) {
    return accountAddress.toLowerCase() in this.walletByAddress;
  }

  public getSigner(accountAddress: string): SignerWithAddress {
    if (!this.has(accountAddress)) {
      throw new Error(`please unlock ${accountAddress} first!`);
    }
    return this.walletByAddress[accountAddress.toLowerCase()];
  }
}
