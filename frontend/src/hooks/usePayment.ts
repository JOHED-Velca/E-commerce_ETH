import { useState } from "react";
import { ethers } from "ethers";
import { PAYMENT_GATEWAY_ADDRESS, PAYMENT_GATEWAY_ABI } from "@/constants/contracts";

//extend Window interface to include ethereum
declare global {
  interface Window {
    ethereum?: any;
  }
}

export function usePayment() {
    const [loading, setLoading] = useState(false);
    const [txHash, setTxHash] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const payWithETH = async (orderId: string, amountIntEth: string) => {
        if(!window.ethereum) {
            setError("Please install MetaMask!");
            return;
        }

        setLoading(true);
        setError(null);
        setTxHash(null);

        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();

            const contract = new ethers.Contract(
                PAYMENT_GATEWAY_ADDRESS,
                PAYMENT_GATEWAY_ABI,
                signer
            );

            const tx = await contract.pay(orderId, {
                value: ethers.parseEther(amountIntEth),
            });

            setTxHash(tx.hash);
            await tx.wait(); //wait for confirmation

            return {
                success: true,
                txHash: tx.hash,
            };
        } catch (err: any) {
            console.error("Payment error:", err);
            setError(err?.message ?? "Unknown error occurred");
            return {
                success: false,
                error: err?.message ?? "Unknown error occurred",
            };
        } finally {
            setLoading(false);
        };
    };

    return {
        payWithETH,
        loading,
        txHash,
        error,
    };
}