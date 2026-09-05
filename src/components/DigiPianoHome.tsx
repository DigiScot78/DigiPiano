interface DigiPianoHomeProps {
  onStartLearning: () => void;
}

export function DigiPianoHome({ onStartLearning }: DigiPianoHomeProps) {
  return (
    <main className="site-home">
      <section className="site-home-card" aria-labelledby="site-home-title">
        <h1 id="site-home-title" className="sr-only">DigiPiano</h1>
        <img
          className="site-home-splash light"
          src="/brand/digipiano-splash-light.png"
          alt="DigiPiano — Learn, Play, Progress"
        />
        <img
          className="site-home-splash dark"
          src="/brand/digipiano-splash-dark.png"
          alt="DigiPiano — Learn, Play, Progress"
        />
        <p>Learn at your own pace, practise music you love, and build confidence with your MIDI piano.</p>
        <button type="button" className="site-home-start" onClick={onStartLearning}>Start learning</button>
      </section>
    </main>
  );
}
