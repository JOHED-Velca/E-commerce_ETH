import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { FLOWCART_TOKEN_ABI, FLOWCART_TOKEN_ADDRESS } from "@/constants/contracts";

export function useTokenBalance(address?: string) {
  const [balance, setBalance] = useState<string | null>(null);

  useEffect(() => {
    const loadBalance = async () => {
      if (!address || !window.ethereum) return;

      const provider = new ethers.BrowserProvider(window.ethereum);
      const contract = new ethers.Contract(FLOWCART_TOKEN_ADDRESS, FLOWCART_TOKEN_ABI, provider);

      try {
        const raw = await contract.balanceOf(address);
        setBalance(ethers.formatUnits(raw, 18));
      } catch (err) {
        console.error("Failed to fetch token balance:", err);
        setBalance(null);
      }
    };

    loadBalance();
  }, [address]);

  return balance;
}
