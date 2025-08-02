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
  const [showWalletCard, setShowWalletCard] = useState(false);

  const connectwalletHandler = async () => {
    if (window.ethereum) {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        await provider.send("eth_requestAccounts", []);
        const signer = await provider.getSigner();
        await accountChangedHandler(signer);
        setShowWalletCard(true); // Show the wallet card after successful connection
      } catch (error) {
        setErrorMessage("Failed to connect to wallet");
        setShowWalletCard(true); // Show card even on error to display error message
      }
    } else {
      setErrorMessage("Please install MetaMask!!!");
      setShowWalletCard(true); // Show card to display error message
    }
  };

  const handleWalletIconClick = () => {
    if (defaultAccount) {
      // If already connected, just toggle the card visibility
      setShowWalletCard(!showWalletCard);
    } else {
      // If not connected, try to connect
      connectwalletHandler();
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

  // Function to format address to show first 4 and last 4 characters
  const formatAddress = (address: string) => {
    if (!address) return "";
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };


  return (
    <div className="relative">
      <IoWalletOutline 
        className="text-black text-3xl cursor-pointer hover:text-gray-600" 
        onClick={handleWalletIconClick}
      />
      
      {showWalletCard && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black bg-opacity-25 z-40"
            onClick={() => setShowWalletCard(false)}
          ></div>
          
          {/* Wallet Card Modal */}
          <div className="absolute top-full right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-50 p-4" style={{ width: '330px', height: '300px' }}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Wallet</h3>
              <button 
                onClick={() => setShowWalletCard(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            
            {!defaultAccount ? (
              <div className="text-center">
                <Button onClick={connectwalletHandler}>
                  Connect Wallet
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 bg-gray-50 rounded">
                  <p className="text-sm font-medium text-gray-600">Address:</p>
                  <p className="text-sm font-mono font-semibold">{formatAddress(defaultAccount)}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded">
                  <p className="text-sm font-medium text-gray-600">Wallet Amount:</p>
                  <p className="text-lg font-bold">{userBalance} ETH</p>
                </div>
                <Button 
                  onClick={() => {
                    setDefaultAccount(null);
                    setUserBalance(null);
                    setShowWalletCard(false);
                  }}
                  className="w-full"
                >
                  Disconnect
                </Button>
              </div>
            )}
            
            {errorMessage && (
              <div className="mt-3 p-2 bg-red-100 border border-red-300 rounded text-red-700 text-sm">
                {errorMessage}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default WalletCard;