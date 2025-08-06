import { useState } from "react";
import { IoWalletOutline } from "react-icons/io5";

import { ethers } from "ethers";
import Button from "../../../../../components/Button";

import { useTokenBalance } from "@/hooks/useContract";

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
  const fctBalance = useTokenBalance(defaultAccount ?? undefined);

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

  // Function to format address to look like a credit card number
  const formatAddress = (address: string) => {
    if (!address) return "";
    // Format like: 0x12AB ●●●● ●●●● CD34
    const start = address.slice(0, 6);
    const end = address.slice(-4);
    return `${start} ●●●● ●●●● ${end}`;
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
          
          {/* Wallet Card Modal - Credit Card Style */}
          <div className="absolute top-full right-0 mt-2 bg-gradient-to-br from-blue-600 via-blue-700 to-blue-800 rounded-2xl shadow-2xl z-50 p-6 text-white" style={{ width: '400px', height: '250px' }}>
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                  <IoWalletOutline className="text-white text-lg" />
                </div>
                <h3 className="text-lg font-bold">FlowCart Wallet</h3>
              </div>
              <button 
                onClick={() => setShowWalletCard(false)}
                className="text-white hover:text-gray-200 text-xl font-bold"
              >
                ✕
              </button>
            </div>
            
            {!defaultAccount ? (
              <div className="text-center">
                <div className="mb-4">
                  <p className="text-white text-opacity-80 mb-4">Connect your wallet to get started</p>
                </div>
                <Button 
                  onClick={connectwalletHandler}
                  className="bg-white text-blue-700 hover:bg-gray-100 font-semibold px-6 py-2 rounded-lg"
                >
                  Connect Wallet
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Card Number Style Address */}
                <div className="space-y-1">
                  <p className="text-white text-opacity-70 text-xs uppercase tracking-wider">Wallet Address</p>
                  <p className="text-white font-mono text-lg tracking-widest">{formatAddress(defaultAccount)}</p>
                </div>
                
                {/* Balance Section */}
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-white text-opacity-70 text-xs uppercase tracking-wider">ETH Balance</p>
                    <p className="text-white text-2xl font-bold">{userBalance}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-white text-opacity-70 text-xs uppercase tracking-wider">FCT Tokens</p>
                    <p className="text-white text-xl font-semibold">{fctBalance ?? "Loading..."}</p>
                  </div>
                </div>
                
                {/* Bottom section */}
                <div className="flex justify-between items-center mt-6">
                  <div className="text-white text-opacity-70 text-xs">
                    <p>FlowCart Network</p>
                  </div>
                  <Button 
                    onClick={() => {
                      setDefaultAccount(null);
                      setUserBalance(null);
                      setShowWalletCard(false);
                    }}
                    className="bg-white bg-opacity-20 text-white hover:bg-opacity-30 text-sm px-4 py-1 rounded-lg backdrop-blur-sm"
                  >
                    Disconnect
                  </Button>
                </div>
              </div>
            )}
            
            {errorMessage && (
              <div className="mt-4 p-3 bg-red-500 bg-opacity-80 backdrop-blur-sm rounded-lg text-white text-sm">
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