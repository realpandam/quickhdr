import Examples from './components/Examples';
import Footer from './components/Footer';
import Header from './components/Header';
import Hero from './components/Hero';
import HowItWorks from './components/HowItWorks';
import ImageUploader from './components/ImageUploader';
import Pricing from './components/Pricing';

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <HowItWorks />
        <Examples />
        <Pricing />
        <ImageUploader />
      </main>
      <Footer />
    </>
  );
}