const express = require("express");
const router = express.Router();
const { Asset } = require("@stellar/stellar-sdk");
const { server } = require("../config/stellar");
const { success } = require("../utils/response");
const { validateAssetCode, validateAccountId } = require("../utils/validators");

/**
 * GET /dex/arbitrage/:assetode/:assetIssuer
 * Checks for circular paths back to the same asset to find arbitrage opportunities.
 *
 * Acceptance Criteria:
 * - GET /dex/arbitrage/:asseCtCode/:assetIssuer checks for circular paths back to the same asset
 * - Uses Horizon's strict-receive path finding to find paths from the asset back to itself
 * - Returns { pathsFound: true/false, paths: [...] } with source amount vs destination amount per path
 * - Returns 400 for invalid asset format
 *
 * @example
 * GET /dex/arbitrage/USDC/GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN
 */
router.get("/arbitrage/:assetCode/:assetIssuer", async (req, res, next) => {
  try {
    const { assetCode, assetIssuer } = req.params;

    // Validate asset format
    try {
      if (assetCode.toUpperCase() === "XLM" && assetIssuer.toLowerCase() === "native") {
        // Native XLM is valid
      } else {
        validateAssetCode(assetCode);
        validateAccountId(assetIssuer);
      }
    } catch (err) {
      return res.status(400).json({
        success: false,
        error: {
          type: "ValidationError",
          message: err.message,
        },
      });
    }

    const asset = (assetCode.toUpperCase() === "XLM" && assetIssuer.toLowerCase() === "native")
      ? Asset.native()
      : new Asset(assetCode.toUpperCase(), assetIssuer);

    // Use a fixed destination amount to check for paths
    // We use "10.0" as a standard test amount, but it could be anything.
    const destinationAmount = "10.0000000";

    const pathsResponse = await server
      .strictReceivePaths([asset], asset, destinationAmount)
      .call();

    const paths = (pathsResponse.records || [])
      .map((path) => ({
        sourceAmount: path.source_amount,
        destinationAmount: path.destination_amount,
        path: path.path.map((hop) => ({
          assetCode: hop.asset_code || "XLM",
          assetIssuer: hop.asset_issuer || "native",
          assetType: hop.asset_type,
        })),
        isProfitable: parseFloat(path.source_amount) < parseFloat(path.destination_amount),
      }))
      .filter((p) => p.path.length > 0); // Only include actual paths with hops

    return success(res, {
      pathsFound: paths.length > 0,
      paths: paths,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
