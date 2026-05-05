import Header from './components/Header';
import Hero from './components/Hero';
import Examples from './components/Examples';
import HowItWorks from './components/HowItWorks';
import ImageUploader from './components/ImageUploader';
import Footer from './components/Footer';
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