import Order from '../models/Order.js';
import { DateTime } from 'luxon'; // Install: npm install luxon (for easy timezone handling)

export const getSummary = async (req, res) => {
  try {
    // Helper: Algeria timezone
    const now = DateTime.now().setZone('Africa/Algiers');
    const todayStart = now.startOf('day').toUTC().toJSDate();
    const thirtyDaysAgo = now.minus({ days: 30 }).startOf('day').toUTC().toJSDate();
    const thisMonthStart = now.startOf('month').toUTC().toJSDate();

    // Basic stats (with fixes: revenue only from confirmed/delivered – adjust if needed)
    const totalOrders = await Order.countDocuments();
    const pendingOrders = await Order.countDocuments({ status: 'pending' });
    const deliveredOrders = await Order.countDocuments({ status: 'delivered' });
    const cancelledOrders = await Order.countDocuments({ status: 'cancelled' });

    const totalRevenueResult = await Order.aggregate([
      { $match: { status: { $in: ['confirmed', 'delivered'] } } }, // Or just 'delivered'
      { $group: { _id: null, total: { $sum: '$totalPrice' } } }
    ]);
    const totalRevenue = totalRevenueResult[0]?.total || 0;

    const monthlyRevenueResult = await Order.aggregate([
      { $match: { createdAt: { $gte: thisMonthStart }, status: { $in: ['confirmed', 'delivered'] } } },
      { $group: { _id: null, total: { $sum: '$totalPrice' } } }
    ]);
    const monthlyRevenue = monthlyRevenueResult[0]?.total || 0;

    const todayOrders = await Order.countDocuments({ createdAt: { $gte: todayStart } });

    // New: Cancellation rate
    const cancellationRate = totalOrders > 0 ? (cancelledOrders / totalOrders) * 100 : 0;

    // Chart 1: Daily data last 30 days
    const dailyData = await Order.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Africa/Algiers' } },
          orders: { $sum: 1 },
          revenue: { $sum: { $cond: [{ $in: ['$status', ['confirmed', 'delivered']] }, '$totalPrice', 0] } }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Chart 2: Revenue by status
    const revenueByStatus = await Order.aggregate([
      { $group: { _id: '$status', total: { $sum: '$totalPrice' } } },
      { $sort: { total: -1 } }
    ]);

    // Chart 3: Orders by deliveryType
    const ordersByDelivery = await Order.aggregate([
      { $group: { _id: '$deliveryType', count: { $sum: 1 } } }
    ]);

    // Top wilayas (bonus from earlier)
    const topWilayas = await Order.aggregate([
      { $group: { _id: '$wilaya', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);

    res.json({
      totalOrders,
      pendingOrders,
      totalRevenue,
      monthlyRevenue,
      todayOrders,
      cancellationRate,
      deliveredOrders, // For AOV if you want later
      dailyData,
      revenueByStatus,
      ordersByDelivery,
      topWilayas
    });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
};