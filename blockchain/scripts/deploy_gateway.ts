import { ethers } from "hardhat";

async function main() {
    const Gateway = await ethers.getContractFactory("PaymentGateway");
    const gateway = await Gateway.deploy();
    await gateway.waitForDeployment();

    console.log("PaymentGateway deployed to:", await gateway.getAddress());
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});