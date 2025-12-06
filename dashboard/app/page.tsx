'use client';

import { HeroSection } from '@/components/landing/HeroSection';
import { LLMSpecialists } from '@/components/landing/LLMSpecialists';
import { FeaturesGrid } from '@/components/landing/FeaturesGrid';
import { PlatformIntegrations } from '@/components/landing/PlatformIntegrations';
import { PerformanceStats } from '@/components/landing/PerformanceStats';
import { CTASection } from '@/components/landing/CTASection';

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-slate-950">
      <HeroSection />
      <LLMSpecialists />
      <FeaturesGrid />
      <PlatformIntegrations />
      <PerformanceStats />
      <CTASection />
    </main>
  );
}
