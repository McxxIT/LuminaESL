"use client";

import Icon from "./Icon";

export type AppNotification = {
  id: number;
  title: string;
  detail: string;
  unread: boolean;
};

export default function NotificationPanel({ notifications, onRead, onClose }: { notifications: AppNotification[]; onRead: (id: number) => void; onClose: () => void }) {
  return <div className="popover notification-panel">
    <div className="popover-header"><div><strong>Notifications</strong><small>{notifications.filter((item) => item.unread).length} unread</small></div><button type="button" className="icon-button" aria-label="Close notifications" onClick={onClose}><Icon name="x" size={16} /></button></div>
    <div className="notification-list">{notifications.length === 0 ? <p className="empty-state">You&apos;re all caught up.</p> : notifications.map((item) => <button type="button" className={`notification-item ${item.unread ? "unread" : ""}`} key={item.id} onClick={() => onRead(item.id)}><span className="notification-symbol"><Icon name={item.id % 2 === 0 ? "calendar" : "bell"} size={14} /></span><span><strong>{item.title}</strong><small>{item.detail}</small></span>{item.unread && <i />}</button>)}</div>
    <button type="button" className="popover-footer" onClick={() => notifications.forEach((item) => onRead(item.id))}>Mark all as read</button>
  </div>;
}
