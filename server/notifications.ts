import { Response } from "express";

// Store active SSE connections
const activeConnections = new Map<number, Response>();

/**
 * Register an SSE connection for a user
 */
export function registerSSEConnection(userId: number, res: Response) {
  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  // Send initial connection message
  res.write('data: {"type":"connected","message":"Connected to notifications"}\n\n');

  // Store connection
  activeConnections.set(userId, res);

  // Handle client disconnect
  res.on("close", () => {
    activeConnections.delete(userId);
  });

  res.on("error", () => {
    activeConnections.delete(userId);
  });
}

/**
 * Send notification to a specific user
 */
export function sendNotificationToUser(userId: number, notification: any) {
  const connection = activeConnections.get(userId);
  if (connection && !connection.writableEnded) {
    connection.write(`data: ${JSON.stringify(notification)}\n\n`);
  }
}

/**
 * Send notification to multiple users
 */
export function sendNotificationToUsers(userIds: number[], notification: any) {
  userIds.forEach((userId) => {
    sendNotificationToUser(userId, notification);
  });
}

/**
 * Broadcast notification to all drivers
 */
export function broadcastToAllDrivers(notification: any) {
  activeConnections.forEach((connection, userId) => {
    if (!connection.writableEnded) {
      connection.write(`data: ${JSON.stringify(notification)}\n\n`);
    }
  });
}

/**
 * Close a user's connection
 */
export function closeUserConnection(userId: number) {
  const connection = activeConnections.get(userId);
  if (connection && !connection.writableEnded) {
    connection.end();
  }
  activeConnections.delete(userId);
}

/**
 * Get active connections count (for debugging)
 */
export function getActiveConnectionsCount() {
  return activeConnections.size;
}
