/**
 * PeerConnection Service
 * Manages RTCPeerConnection lifecycle, STUN configuration, ICE candidates, and DataChannels.
 */

export interface PeerConnectionConfig {
  stunServers?: string[];
  onIceCandidate: (candidate: RTCIceCandidate) => void;
  onConnectionStateChange: (state: RTCPeerConnectionState) => void;
  onDataChannelOpened: (channel: RTCDataChannel) => void;
  onError: (error: Error) => void;
}

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  {
    urls: 'stun:stun.l.google.com:19302',
  },
  {
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
    ],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

export class PeerConnectionService {
  private pc: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private config: PeerConnectionConfig;

  constructor(config: PeerConnectionConfig) {
    this.config = config;
  }

  public initialize(isInitiator: boolean): void {
    if (this.pc) {
      this.close();
    }

    const iceServers = this.config.stunServers && this.config.stunServers.length > 0
      ? [{ urls: this.config.stunServers }, ...DEFAULT_ICE_SERVERS.slice(1)]
      : DEFAULT_ICE_SERVERS;

    this.pc = new RTCPeerConnection({
      iceServers,
      iceCandidatePoolSize: 2,
    });

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.config.onIceCandidate(event.candidate);
      }
    };

    this.pc.onconnectionstatechange = () => {
      if (this.pc) {
        this.config.onConnectionStateChange(this.pc.connectionState);
        if (this.pc.connectionState === 'failed') {
          this.config.onError(new Error('WebRTC connection failed (NAT traversal blocked)'));
        }
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      if (this.pc) {
        if (this.pc.iceConnectionState === 'connected' || this.pc.iceConnectionState === 'completed') {
          this.config.onConnectionStateChange('connected');
        } else if (this.pc.iceConnectionState === 'failed') {
          this.config.onConnectionStateChange('failed');
          this.config.onError(new Error('WebRTC ICE failed (NAT traversal blocked)'));
        }
      }
    };

    if (isInitiator) {
      // Sender creates the RTCDataChannel
      this.dataChannel = this.pc.createDataChannel('sharepin-transfer', {
        ordered: true,
      });
      this.setupDataChannel(this.dataChannel);
    } else {
      // Receiver waits for the data channel event
      this.pc.ondatachannel = (event) => {
        this.dataChannel = event.channel;
        this.setupDataChannel(this.dataChannel);
      };
    }
  }

  private setupDataChannel(channel: RTCDataChannel): void {
    channel.binaryType = 'arraybuffer';

    if (channel.readyState === 'open') {
      this.config.onDataChannelOpened(channel);
    }

    channel.onopen = () => {
      this.config.onDataChannelOpened(channel);
    };

    channel.onerror = (ev) => {
      const err = (ev as any).error || new Error('RTCDataChannel encountered an error');
      this.config.onError(err);
    };
  }

  private queuedCandidates: RTCIceCandidateInit[] = [];

  public async createOffer(): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) throw new Error('RTCPeerConnection is not initialized');
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return {
      type: offer.type,
      sdp: offer.sdp,
    };
  }

  public async handleOfferAndCreateAnswer(
    offer: RTCSessionDescriptionInit
  ): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) throw new Error('RTCPeerConnection is not initialized');
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    await this.flushQueuedCandidates();
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return {
      type: answer.type,
      sdp: answer.sdp,
    };
  }

  public async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.pc) throw new Error('RTCPeerConnection is not initialized');
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
    await this.flushQueuedCandidates();
  }

  public async addIceCandidate(candidateInit: RTCIceCandidateInit): Promise<void> {
    if (!this.pc || !this.pc.remoteDescription) {
      this.queuedCandidates.push(candidateInit);
      return;
    }
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidateInit));
    } catch (err) {
      console.warn('Could not add ICE candidate:', err);
    }
  }

  private async flushQueuedCandidates(): Promise<void> {
    if (!this.pc || !this.pc.remoteDescription) return;
    while (this.queuedCandidates.length > 0) {
      const candidate = this.queuedCandidates.shift();
      if (candidate) {
        try {
          await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.warn('Failed to add queued candidate:', err);
        }
      }
    }
  }

  public getDataChannel(): RTCDataChannel | null {
    return this.dataChannel;
  }

  public close(): void {
    if (this.dataChannel) {
      try {
        this.dataChannel.close();
      } catch {}
      this.dataChannel = null;
    }

    if (this.pc) {
      try {
        this.pc.close();
      } catch {}
      this.pc = null;
    }
  }
}
