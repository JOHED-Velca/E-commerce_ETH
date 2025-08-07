import React, { useState } from "react";
import { usePayment } from "@/hooks/usePayment";
import Button from "@/components/components/Button";

interface CryptoCheckoutProps {
  orderId: string;
  amountEth: string; // e.g., "0.01"
}

const CryptoCheckout: React.FC<CryptoCheckoutProps> = ({ orderId, amountEth }) => {
  const { payWithETH, loading, txHash, error } = usePayment();
  const [confirmed, setConfirmed] = useState(false);

  const handlePay = async () => {
    const result = await payWithETH(orderId, amountEth);
    if (result?.success) {
      setConfirmed(true);
    }
  };

  return (
    <div className="border p-4 rounded shadow-sm bg-white max-w-md mx-auto">
      <h3 className="text-xl font-semibold mb-3">Pay with Crypto</h3>

      <p className="mb-2 text-sm text-gray-700">
        You’re about to pay <strong>{amountEth} ETH</strong> for order{" "}
        <code>{orderId}</code>
      </p>

      <Button onClick={handlePay} disabled={loading || confirmed} className="w-full">
        {loading ? "Processing..." : confirmed ? "Paid ✅" : "Pay with ETH"}
      </Button>

      {txHash && (
        <p className="mt-3 text-sm text-green-600 break-all">
          Transaction sent:{" "}
          <a
            href={`https://sepolia.etherscan.io/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            {txHash}
          </a>
        </p>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
};

export default CryptoCheckout;
