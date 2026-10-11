/**
 * SharePin Session Types & State Machine
 */

export type PeerRole = 'sender' | 'receiver';

export type SessionState =
  | 'IDLE'
  | 'CREATING'
  | 'WAITING_FOR_RECEIVER'
  | 'RECEIVER_JOINED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'TRANSFERRING'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'FAILED';

export interface SessionInfo {
  sessionId: string;
  pin: string;
  createdAt: number;
  expiresAt: number; // 3 minutes from creation
  state: SessionState;
  role: PeerRole;
}

export type SignalingMessageType =
  | 'JOIN_REQUEST'
  | 'JOIN_ACCEPTED'
  | 'JOIN_REJECTED'
  | 'OFFER'
  | 'ANSWER'
  | 'ICE_CANDIDATE'
  | 'SENDER_APPROVAL_REQUEST'
  | 'SENDER_APPROVED'
  | 'SENDER_REJECTED'
  | 'SESSION_CANCELLED'
  | 'SESSION_EXPIRED'
  | 'PEER_CONNECTED'
  | 'PEER_DISCONNECTED'
  | 'HEARTBEAT'
  | 'HEARTBEAT_ACK';

export interface SignalingMessage {
  type: SignalingMessageType;
  sessionId: string;
  senderRole: PeerRole;
  payload?: any;
  timestamp: number;
}

export interface JoinRequestPayload {
  pin: string;
  userAgent?: string;
}

export interface JoinAcceptedPayload {
  sessionId: string;
  token: string;
  createdAt: number;
  expiresAt: number;
}

export interface JoinRejectedPayload {
  code: 'INVALID_PIN' | 'EXPIRED_PIN' | 'ALREADY_PAIRED' | 'RATE_LIMITED' | 'CAPACITY_REACHED' | 'SERVER_ERROR';
  message: string;
}

export interface CreateSessionResponse {
  success: boolean;
  sessionId: string;
  pin: string;
  token: string;
  createdAt: number;
  expiresAt: number;
}
