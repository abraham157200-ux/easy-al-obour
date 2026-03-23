import { eq, and, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  orders,
  driversAvailability,
  notifications,
  orderHistory,
  Order,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

/**
 * Create or update a user
 */
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId && !user.phone) {
    throw new Error("User openId or phone is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId || `phone-${user.phone}`,
    };
    const updateSet: Record<string, unknown> = {};

    if (user.phone !== undefined) {
      values.phone = user.phone;
      updateSet.phone = user.phone;
    }
    if (user.password !== undefined) {
      values.password = user.password;
      updateSet.password = user.password;
    }

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    }

    if (user.isActive !== undefined) {
      values.isActive = user.isActive;
      updateSet.isActive = user.isActive;
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

/**
 * Get user by openId
 */
export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/**
 * Get user by phone number
 */
export async function getUserByPhone(phone: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/**
 * Get user by ID
 */
export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/**
 * Get all users (Admin only)
 */
export async function getAllUsers() {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get users: database not available");
    return [];
  }

  return await db.select().from(users);
}

/**
 * Get all drivers
 */
export async function getAllDrivers() {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get drivers: database not available");
    return [];
  }

  return await db.select().from(users).where(eq(users.role, "driver"));
}

/**
 * Get available drivers
 */
export async function getAvailableDrivers() {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get available drivers: database not available");
    return [];
  }

  return await db.select().from(driversAvailability).where(eq(driversAvailability.isAvailable, true));
}

/**
 * Update driver location
 */
export async function updateDriverLocation(
  driverId: number,
  latitude: number,
  longitude: number
) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot update driver location: database not available");
    return;
  }

  try {
    await db
      .insert(driversAvailability)
      .values({
        driverId,
        latitude: latitude.toString(),
        longitude: longitude.toString(),
        isAvailable: true,
      })
      .onDuplicateKeyUpdate({
        set: {
          latitude: latitude.toString(),
          longitude: longitude.toString(),
        },
      });
  } catch (error) {
    console.error("[Database] Failed to update driver location:", error);
    throw error;
  }
}

/**
 * Update user profile
 */
export async function updateUserProfile(
  userId: number,
  data: { name?: string; email?: string; phone?: string }
) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot update user profile: database not available");
    return undefined;
  }

  try {
    const updateSet: Record<string, unknown> = {};
    if (data.name !== undefined) updateSet.name = data.name;
    if (data.email !== undefined) updateSet.email = data.email;
    if (data.phone !== undefined) updateSet.phone = data.phone;

    if (Object.keys(updateSet).length === 0) {
      return await getUserById(userId);
    }

    await db.update(users).set(updateSet).where(eq(users.id, userId));
    return await getUserById(userId);
  } catch (error) {
    console.error("[Database] Failed to update user profile:", error);
    throw error;
  }
}

/**
 * Get driver availability
 */
export async function getDriverAvailability(driverId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get driver availability: database not available");
    return undefined;
  }

  const result = await db
    .select()
    .from(driversAvailability)
    .where(eq(driversAvailability.driverId, driverId))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

/**
 * Update user location (for both customers and drivers)
 */
export async function updateUserLocation(userId: number, latitude: number, longitude: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot update user location: database not available");
    return;
  }

  try {
    await db
      .update(users)
      .set({
        latitude: latitude.toString(),
        longitude: longitude.toString(),
      })
      .where(eq(users.id, userId));
  } catch (error) {
    console.error("[Database] Failed to update user location:", error);
    throw error;
  }
}

/**
 * Create new order
 */
export async function createOrder(orderData: {
  customerId: number;
  pickupLocation: { address: string; latitude: number; longitude: number };
  deliveryLocation: { address: string; latitude: number; longitude: number };
  price?: number;
  distance?: number;
  estimatedTime?: number;
  notes?: string;
  status?: string;
}) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot create order: database not available");
    return undefined;
  }

  try {
    const result = await db.insert(orders).values({
      customerId: orderData.customerId,
      pickupLocation: orderData.pickupLocation,
      deliveryLocation: orderData.deliveryLocation,
      price: orderData.price?.toString(),
      distance: orderData.distance?.toString(),
      estimatedTime: orderData.estimatedTime,
      notes: orderData.notes,
      status: (orderData.status || "pending") as any,
    });

    return result;
  } catch (error) {
    console.error("[Database] Failed to create order:", error);
    throw error;
  }
}

/**
 * Get orders by customer ID
 */
export async function getOrdersByCustomerId(customerId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get orders: database not available");
    return [];
  }

  return await db.select().from(orders).where(eq(orders.customerId, customerId));
}

/**
 * Get orders by driver ID
 */
export async function getOrdersByDriverId(driverId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get orders: database not available");
    return [];
  }

  return await db.select().from(orders).where(eq(orders.driverId, driverId));
}

/**
 * Get available orders (pending orders without driver)
 */
export async function getAvailableOrders() {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get orders: database not available");
    return [];
  }

  return await db
    .select()
    .from(orders)
    .where(and(eq(orders.status, "pending"), sql`${orders.driverId} IS NULL`));
}

/**
 * Get order by ID
 */
export async function getOrderById(orderId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get order: database not available");
    return undefined;
  }

  const result = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/**
 * Update order status
 */
export async function updateOrderStatus(orderId: number, status: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot update order: database not available");
    return;
  }

  try {
    const updateData: any = { status };
    if (status === "delivered") {
      updateData.deliveredAt = new Date();
    }

    await db.update(orders).set(updateData).where(eq(orders.id, orderId));

    // Update driver commission when order is delivered
    if (status === "delivered") {
      const order = await getOrderById(orderId);
      if (order && order.driverId) {
        // Import COMMISSION_PER_ORDER constant
        const { COMMISSION_PER_ORDER } = await import("../shared/pricing");
        // Add fixed commission per order (3 EGP), not the order price
        await updateDriverCommission(order.driverId, COMMISSION_PER_ORDER);
      }
    }

    // Log to order history
    const order = await getOrderById(orderId);
    if (order) {
      await db.insert(orderHistory).values({
        orderId,
        status,
        changedBy: order.driverId || order.customerId,
      });
    }
  } catch (error) {
    console.error("[Database] Failed to update order:", error);
    throw error;
  }
}

/**
 * Assign order to driver
 */
export async function assignOrderToDriver(orderId: number, driverId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot assign order: database not available");
    return;
  }

  try {
    await db
      .update(orders)
      .set({ driverId, status: "assigned" })
      .where(eq(orders.id, orderId));
  } catch (error) {
    console.error("[Database] Failed to assign order:", error);
    throw error;
  }
}

/**
 * Rate order
 */
export async function rateOrder(orderId: number, rating: number, comment?: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot rate order: database not available");
    return;
  }

  try {
    await db
      .update(orders)
      .set({ rating, ratingComment: comment })
      .where(eq(orders.id, orderId));
  } catch (error) {
    console.error("[Database] Failed to rate order:", error);
    throw error;
  }
}

/**
 * Get all orders (Admin only)
 */
export async function getAllOrders() {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get orders: database not available");
    return [];
  }

  return await db.select().from(orders);
}

/**
 * Get statistics (Admin only)
 */
export async function getStatistics() {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get statistics: database not available");
    return {
      totalOrders: 0,
      totalRevenue: 0,
      activeDrivers: 0,
      totalCustomers: 0,
    };
  }

  try {
    const totalOrders = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(orders);

    const totalRevenue = await db
      .select({ sum: sql<number>`SUM(price)` })
      .from(orders);

    const activeDrivers = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(users)
      .where(and(eq(users.role, "driver"), eq(users.isActive, true)));

    const totalCustomers = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(users)
      .where(eq(users.role, "customer"));

    return {
      totalOrders: totalOrders[0]?.count || 0,
      totalRevenue: totalRevenue[0]?.sum || 0,
      activeDrivers: activeDrivers[0]?.count || 0,
      totalCustomers: totalCustomers[0]?.count || 0,
    };
  } catch (error) {
    console.error("[Database] Failed to get statistics:", error);
    return {
      totalOrders: 0,
      totalRevenue: 0,
      activeDrivers: 0,
      totalCustomers: 0,
    };
  }
}

/**
 * Create notification
 */
export async function createNotification(
  userId: number,
  title: string,
  content: string,
  type: string
) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot create notification: database not available");
    return;
  }

  try {
    await db.insert(notifications).values({
      userId,
      title,
      content,
      type: type as any,
    });
  } catch (error) {
    console.error("[Database] Failed to create notification:", error);
    throw error;
  }
}

/**
 * Get user notifications
 */
export async function getUserNotifications(userId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get notifications: database not available");
    return [];
  }

  return await db.select().from(notifications).where(eq(notifications.userId, userId));
}

/**
 * Mark notification as read
 */
export async function markNotificationAsRead(notificationId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot update notification: database not available");
    return;
  }

  try {
    await db
      .update(notifications)
      .set({ isRead: true, readAt: new Date() })
      .where(eq(notifications.id, notificationId));
  } catch (error) {
    console.error("[Database] Failed to mark notification as read:", error);
    throw error;
  }
}



/**
 * Update driver commission (add pending commission)
 */
export async function updateDriverCommission(driverId: number, amount: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot update commission: database not available");
    return undefined;
  }

  try {
    const driver = await getUserById(driverId);
    if (!driver) {
      throw new Error("Driver not found");
    }

    const currentPending = parseFloat(driver.pendingCommission?.toString() || "0");
    const newPending = currentPending + amount;

    // إذا تجاوزت العمولات المستحقة 30 جنيه، قم بإيقاف الحساب تلقائياً
    // يتم الحظر فقط عند تجاوز 30 جنيه (أكبر من 30 وليس يساوي)
    const shouldSuspend = newPending > 30;

    const updateData: any = {
      pendingCommission: newPending.toString(),
    };

    if (shouldSuspend && driver.accountStatus !== "disabled") {
      updateData.accountStatus = "disabled";
      updateData.suspensionReason = "عمولات مستحقة تجاوزت 30 جنيه";
      updateData.suspendedAt = new Date();
    }

    await db.update(users).set(updateData).where(eq(users.id, driverId));
    return await getUserById(driverId);
  } catch (error) {
    console.error("[Database] Failed to update commission:", error);
    throw error;
  }
}

/**
 * Mark commission as paid
 */
export async function markCommissionAsPaid(driverId: number, amount: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot mark commission as paid: database not available");
    return undefined;
  }

  try {
    const driver = await getUserById(driverId);
    if (!driver) {
      throw new Error("Driver not found");
    }

    const currentPending = parseFloat(driver.pendingCommission?.toString() || "0");
    const currentPaid = parseFloat(driver.paidCommission?.toString() || "0");

    const newPending = Math.max(0, currentPending - amount);
    const newPaid = currentPaid + amount;

    const updateData: any = {
      pendingCommission: newPending.toString(),
      paidCommission: newPaid.toString(),
    };

    // إذا أصبحت العمولات المستحقة أقل من 30 جنيه، قم بتفعيل الحساب
    if (newPending < 30 && driver.accountStatus === "disabled") {
      updateData.accountStatus = "active";
      updateData.suspensionReason = null;
      updateData.suspendedAt = null;
      // إعادة تعيين العمولات المستحقة عند التفعيل
      updateData.pendingCommission = "0";
      updateData.paidCommission = "0";
    }

    await db.update(users).set(updateData).where(eq(users.id, driverId));
    return await getUserById(driverId);
  } catch (error) {
    console.error("[Database] Failed to mark commission as paid:", error);
    throw error;
  }
}

/**
 * Suspend or resume driver account (Admin)
 */
export async function updateAccountStatus(
  driverId: number,
  status: "active" | "suspended" | "disabled",
  reason?: string
) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot update account status: database not available");
    return undefined;
  }

  try {
    const updateData: any = {
      accountStatus: status,
    };

    if (status === "active") {
      updateData.suspensionReason = null;
      updateData.suspendedAt = null;
      // الحصول على المستخدم الحالي لنقل العمولات المستحقة إلى المدفوعة
      const currentUser = await getUserById(driverId);
      if (currentUser) {
        const pending = typeof currentUser.pendingCommission === 'string' ? parseFloat(currentUser.pendingCommission) : (currentUser.pendingCommission || 0);
        const paid = typeof currentUser.paidCommission === 'string' ? parseFloat(currentUser.paidCommission) : (currentUser.paidCommission || 0);
        if (pending > 0) {
          // نقل العمولات المستحقة إلى المدفوعة
          updateData.paidCommission = paid + pending;
        }
      }
      // مسح العمولات المستحقة عند تفعيل الحساب
      updateData.pendingCommission = 0;
    } else {
      updateData.suspensionReason = reason || "تم إيقاف الحساب من قبل الإدارة";
      updateData.suspendedAt = new Date();
    }

    await db.update(users).set(updateData).where(eq(users.id, driverId));
    return await getUserById(driverId);
  } catch (error) {
    console.error("[Database] Failed to update account status:", error);
    throw error;
  }
}

/**
 * Delete user (Admin only)
 */
export async function deleteUser(userId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot delete user: database not available");
    return;
  }

  try {
    await db.delete(users).where(eq(users.id, userId));
  } catch (error) {
    console.error("[Database] Failed to delete user:", error);
    throw error;
  }
}

/**
 * Delete order (Admin only)
 */
export async function deleteOrder(orderId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot delete order: database not available");
    return;
  }

  try {
    // حذف سجل الطلب أولاً
    await db.delete(orderHistory).where(eq(orderHistory.orderId, orderId));
    // ثم حذف الطلب نفسه
    await db.delete(orders).where(eq(orders.id, orderId));
  } catch (error) {
    console.error("[Database] Failed to delete order:", error);
    throw error;
  }
}

/**
 * Get all active drivers (not suspended or disabled)
 */
export async function getActiveDrivers() {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get active drivers: database not available");
    return [];
  }

  return await db
    .select()
    .from(users)
    .where(and(eq(users.role, "driver"), eq(users.accountStatus, "active")));
}

/**
 * Get suspended drivers
 */
export async function getSuspendedDrivers() {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get suspended drivers: database not available");
    return [];
  }

  return await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.role, "driver"),
        sql`${users.accountStatus} IN ('suspended', 'disabled')`
      )
    );
}
