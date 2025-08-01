import { useState } from "react";
import { IoWalletOutline } from "react-icons/io5";

// import styles from "./index.module.scss";
// import { useAppSelector } from "../../../../../../app/hooks";

import { ethers } from "ethers";
import Button from "../../../../../components/Button";

// Extend Window interface to include ethereum
declare global {
  interface Window {
    ethereum?: any;
  }
}

const WalletCard = () => {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [defaultAccount, setDefaultAccount] = useState<string | null>(null);
  const [userBalance, setUserBalance] = useState<string | null>(null);

  const connectwalletHandler = async () => {
    if (window.ethereum) {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        await provider.send("eth_requestAccounts", []);
        const signer = await provider.getSigner();
        await accountChangedHandler(signer);
      } catch (error) {
        setErrorMessage("Failed to connect to wallet");
      }
    } else {
      setErrorMessage("Please install MetaMask!!!");
    }
  };

  const accountChangedHandler = async (newAccount: any) => {
    try {
      const address = await newAccount.getAddress();
      setDefaultAccount(address);
      const balance = await newAccount.provider.getBalance(address);
      setUserBalance(ethers.formatEther(balance));
      await getuserBalance(address);
    } catch (error) {
      setErrorMessage("Failed to get account details");
    }
  };

  const getuserBalance = async (address: string) => {
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const balance = await provider.getBalance(address, "latest");
      setUserBalance(ethers.formatEther(balance));
    } catch (error) {
      setErrorMessage("Failed to get balance");
    }
  };


  return (
    <div>
        <IoWalletOutline className="text-black" />
        <Button
            onClick={connectwalletHandler}
        >
            {defaultAccount ? "Connected!!" : "Connect Wallet"}
        </Button>
        {defaultAccount && (
          <div className="balanceDisplay">
            <p className="walletAddress">Addr: {defaultAccount}</p>
            <p>Wallet Amount: {userBalance}</p>
          </div>
        )}
        {errorMessage && <div className="error">{errorMessage}</div>}
    </div>
  );
};

export default WalletCard;