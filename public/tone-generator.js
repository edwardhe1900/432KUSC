// Simple tone generator for testing pitch shifting
class ToneGenerator {
  constructor(audioContext) {
    this.audioContext = audioContext;
    this.oscillator = null;
    this.gainNode = null;
    this.isPlaying = false;
  }

  start(frequency = 440) {
    if (this.isPlaying) this.stop();
    
    // Create an oscillator for the tone
    this.oscillator = this.audioContext.createOscillator();
    this.oscillator.type = 'sine';
    this.oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
    
    // Create a gain node for volume control
    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.setValueAtTime(0.5, this.audioContext.currentTime);
    
    // Connect nodes
    this.oscillator.connect(this.gainNode);
    
    // Start the oscillator
    this.oscillator.start();
    this.isPlaying = true;
    
    return this.gainNode; // Return the output node
  }

  stop() {
    if (!this.isPlaying) return;
    
    // Fade out to avoid clicks
    if (this.gainNode) {
      const now = this.audioContext.currentTime;
      this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
      this.gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      
      // Stop after fade out
      setTimeout(() => {
        if (this.oscillator) {
          this.oscillator.stop();
          this.oscillator.disconnect();
          this.oscillator = null;
        }
        if (this.gainNode) {
          this.gainNode.disconnect();
          this.gainNode = null;
        }
      }, 100);
    }
    
    this.isPlaying = false;
  }
}
