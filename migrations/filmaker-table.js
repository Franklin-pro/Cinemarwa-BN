import User from "../models/User.modal.js";
import Payment from "../models/Payment.model.js";
import Movie from "../models/Movie.model.js";

// Helper function to safely parse numeric values
const safeParseNumber = (value) => {
  const num = Number(value);
  return isNaN(num) ? 0 : num;
};

/**
 * Recalculate all filmmaker finances with 6% MTN gateway fee
 * This can be run as a one-time script or added as an admin endpoint
 */
export const recalculateFilmmakerFinances = async (req, res) => {
  try {
    const MTN_GATEWAY_FEE_PERCENT = 6;
    
    // Get all filmmakers
    const filmmakers = await User.findAll({
      where: { role: 'filmmaker' }
    });

    console.log(`Found ${filmmakers.length} filmmakers to process...`);
    
    const results = [];

    for (const filmmaker of filmmakers) {
      try {
        // Get all successful payments for this filmmaker
        const payments = await Payment.findAll({
          where: {
            filmmakerId: filmmaker.id,
            paymentStatus: 'succeeded'
          },
          attributes: ['amount', 'movieId']
        });

        // Get all movies for royalty calculation
        const movies = await Movie.findAll({
          where: { filmmakerId: filmmaker.id },
          attributes: ['id', 'royaltyPercentage', 'totalRevenue']
        });

        // Calculate totals
        let grossRevenue = 0;
        let totalGatewayFees = 0;
        let filmmakerEarnings = 0;

        // Process each payment
        payments.forEach(payment => {
          const amount = safeParseNumber(payment.amount);
          grossRevenue += amount;
          
          // Calculate gateway fee
          const gatewayFee = (amount * MTN_GATEWAY_FEE_PERCENT) / 100;
          totalGatewayFees += gatewayFee;
        });

        // Calculate filmmaker share after gateway fee
        const revenueAfterGatewayFee = grossRevenue - totalGatewayFees;

        // Calculate average royalty percentage
        let totalRoyalty = 0;
        let validRoyaltyCount = 0;
        
        movies.forEach(movie => {
          const royalty = safeParseNumber(movie.royaltyPercentage);
          if (royalty > 0) {
            totalRoyalty += royalty;
            validRoyaltyCount++;
          }
        });

        const avgRoyalty = validRoyaltyCount > 0 ? totalRoyalty / validRoyaltyCount : 70;
        
        // Calculate filmmaker earnings (royalty percentage of revenue after gateway fee)
        filmmakerEarnings = (revenueAfterGatewayFee * avgRoyalty) / 100;

        // Update filmmaker financial fields
        const oldPendingBalance = safeParseNumber(filmmaker.filmmmakerFinancePendingBalance);
        const oldTotalEarned = safeParseNumber(filmmaker.filmmmakerFinanceTotalEarned);
        const withdrawnBalance = safeParseNumber(filmmaker.filmmmakerFinanceWithdrawnBalance);

        // Calculate new pending balance (total earned - withdrawn)
        const newTotalEarned = filmmakerEarnings;
        const newPendingBalance = newTotalEarned - withdrawnBalance;

        // Update the filmmaker record
        await filmmaker.update({
          filmmmakerFinanceTotalEarned: parseFloat(newTotalEarned.toFixed(2)),
          filmmmakerFinancePendingBalance: parseFloat(newPendingBalance.toFixed(2)),
          filmmmakerStatsTotalRevenue: parseFloat(grossRevenue.toFixed(2))
        });

        results.push({
          filmmakerId: filmmaker.id,
          filmmakerName: filmmaker.name,
          paymentsCount: payments.length,
          moviesCount: movies.length,
          calculations: {
            grossRevenue: parseFloat(grossRevenue.toFixed(2)),
            gatewayFees: parseFloat(totalGatewayFees.toFixed(2)),
            revenueAfterFee: parseFloat(revenueAfterGatewayFee.toFixed(2)),
            avgRoyalty: parseFloat(avgRoyalty.toFixed(1)),
            filmmakerEarnings: parseFloat(filmmakerEarnings.toFixed(2))
          },
          balances: {
            old: {
              totalEarned: parseFloat(oldTotalEarned.toFixed(2)),
              pendingBalance: parseFloat(oldPendingBalance.toFixed(2))
            },
            new: {
              totalEarned: parseFloat(newTotalEarned.toFixed(2)),
              pendingBalance: parseFloat(newPendingBalance.toFixed(2))
            },
            difference: {
              totalEarned: parseFloat((newTotalEarned - oldTotalEarned).toFixed(2)),
              pendingBalance: parseFloat((newPendingBalance - oldPendingBalance).toFixed(2))
            }
          },
          success: true
        });

        console.log(`✓ Updated filmmaker: ${filmmaker.name} (ID: ${filmmaker.id})`);

      } catch (error) {
        console.error(`✗ Error processing filmmaker ${filmmaker.id}:`, error.message);
        results.push({
          filmmakerId: filmmaker.id,
          filmmakerName: filmmaker.name,
          success: false,
          error: error.message
        });
      }
    }

    // Summary statistics
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const totalGatewayFeesDeducted = results
      .filter(r => r.success)
      .reduce((sum, r) => sum + r.calculations.gatewayFees, 0);

    const summary = {
      totalFilmmakers: filmmakers.length,
      successful,
      failed,
      totalGatewayFeesDeducted: parseFloat(totalGatewayFeesDeducted.toFixed(2)),
      timestamp: new Date().toISOString()
    };

    console.log('\n=== RECALCULATION SUMMARY ===');
    console.log(`Total Filmmakers: ${summary.totalFilmmakers}`);
    console.log(`Successfully Updated: ${summary.successful}`);
    console.log(`Failed: ${summary.failed}`);
    console.log(`Total Gateway Fees Deducted: $${summary.totalGatewayFeesDeducted}`);
    console.log('============================\n');

    if (res) {
      return res.status(200).json({
        success: true,
        message: 'Filmmaker finances recalculated successfully',
        summary,
        results
      });
    }

    return { success: true, summary, results };

  } catch (error) {
    console.error('Error in recalculateFilmmakerFinances:', error);
    if (res) {
      return res.status(500).json({
        success: false,
        message: 'Error recalculating finances',
        error: error.message
      });
    }
    throw error;
  }
};

/**
 * Standalone script version (can be run directly)
 */
export const runRecalculationScript = async () => {
  console.log('Starting filmmaker finance recalculation...\n');
  
  try {
    const result = await recalculateFilmmakerFinances(null, null);
    console.log('\n✓ Recalculation completed successfully!');
    return result;
  } catch (error) {
    console.error('\n✗ Recalculation failed:', error);
    throw error;
  }
};

// If running as standalone script
if (import.meta.url === `file://${process.argv[1]}`) {
  runRecalculationScript()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}