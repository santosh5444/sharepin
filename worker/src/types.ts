/**
 * SharePin Worker Types & Protocol
 */

export interface Env {
  PIN_REGISTRY?: DurableObjectNamespace;
  SESSION_DO?: DurableObjectNamespace;
}

export type PeerRole = 'sender' | 'receiver';

export type SessionState =
  | 'WAITING_FOR_RECEIVER'
  | 'RECEIVER_JOINED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'TRANSFERRING'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'FAILED';

export interface PinRecord {
  pin: string;
  sessionId: string;
  senderToken: string;
  receiverToken?: string;
  createdAt: number;
  expiresAt: number;
  isClaimed: boolean;
  manifest?: any;
  receiverAccepted?: boolean;
}

export type SignalingType =
  | 'OFFER'
  | 'ANSWER'
  | 'ICE_CANDIDATE'
  | 'SENDER_APPROVAL_REQUEST'
  | 'SENDER_APPROVED'
  | 'SENDER_REJECTED'
  | 'SESSION_CANCELLED'
  | 'PEER_CONNECTED'
  | 'PEER_DISCONNECTED'
  | 'PING'
  | 'PONG';

export interface SignalingPacket {
  type: SignalingType;
  senderRole: PeerRole;
  payload?: any;
  timestamp: number;
}
