import { ethers } from "hardhat";

async function main() {
    const initialSupply = ethers.parseEther("1000000"); // 1 million FCT tokens
    const Token = await ethers.getContractFactory("FlowCartToken");
    const token = await Token.deploy(initialSupply);
    await token.waitForDeployment();

    console.log("FlowCartToken deployed to:", await token.getAddress());
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});