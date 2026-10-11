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

const DEFAULT_STUN_SERVERS = [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302',
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

    const stunUrls = this.config.stunServers || DEFAULT_STUN_SERVERS;
    const iceServers: RTCIceServer[] = [
      {
        urls: stunUrls,
      },
    ];

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

    channel.onopen = () => {
      this.config.onDataChannelOpened(channel);
    };

    channel.onerror = (ev) => {
      const err = (ev as any).error || new Error('RTCDataChannel encountered an error');
      this.config.onError(err);
    };
  }

  public async createOffer(): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) throw new Error('RTCPeerConnection is not initialized');
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  public async handleOfferAndCreateAnswer(
    offer: RTCSessionDescriptionInit
  ): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) throw new Error('RTCPeerConnection is not initialized');
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  public async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.pc) throw new Error('RTCPeerConnection is not initialized');
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
  }

  public async addIceCandidate(candidateInit: RTCIceCandidateInit): Promise<void> {
    if (!this.pc) return;
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidateInit));
    } catch (err) {
      // Harmless if connection already established
      console.warn('Could not add ICE candidate:', err);
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
