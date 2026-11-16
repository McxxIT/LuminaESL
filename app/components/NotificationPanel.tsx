"use client";

import Icon from "./Icon";
import type { SchoolNotification } from "../lib/school";

export type AppNotification = SchoolNotification & { unread: boolean };

function timeAgo(at: string) {
  const minutes = Math.round((Date.now() - new Date(at).getTime()) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

/** The bell's dropdown. Clicking an item marks it read and opens the related page. */
export default function NotificationPanel({ notifications, onOpen, onMarkAllRead, onClose }: {
  notifications: AppNotification[];
  onOpen: (notification: AppNotification) => void;
  onMarkAllRead: () => void;
  onClose: () => void;
}) {
  const unread = notifications.filter((item) => item.unread).length;
  return <div className="popover notification-panel">
    <div className="popover-header"><div><strong>Notifications</strong><small>{unread ? `${unread} unread` : "All caught up"}</small></div><button type="button" className="icon-button" aria-label="Close notifications" onClick={onClose}><Icon name="x" size={16} /></button></div>
    <div className="notification-list">{notifications.length === 0
      ? <p className="empty-state">You&apos;re all caught up.</p>
      : notifications.map((item) => <button type="button" className={`notification-item ${item.unread ? "unread" : ""}`} key={item.id} onClick={() => onOpen(item)}>
        <span className="notification-symbol"><Icon name={item.icon} size={14} /></span>
        <span><strong>{item.title}</strong><small>{item.detail}</small></span>
        <em className="notification-time">{timeAgo(item.at)}</em>
        {item.unread && <i />}
      </button>)}</div>
    {notifications.length > 0 && <button type="button" className="popover-footer" onClick={onMarkAllRead} disabled={!unread}>Mark all as read</button>}
  </div>;
}
