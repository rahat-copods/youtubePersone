'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Check, Crown, Zap, Loader2 } from 'lucide-react';
import { PRICING_TIERS, PricingTier } from '@/lib/pricing';
import { useAuth } from '@/components/providers/auth-provider';
import toast from 'react-hot-toast';

export default function PricingPage() {
  const { user, userPlan, refreshUserPlan } = useAuth();
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState<PricingTier | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [testCode, setTestCode] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('yearly');

  const handleSelectPlan = (plan: PricingTier) => {
    if (!user) {
      toast.error('Please sign in to select a plan');
      router.push('/auth/signin');
      return;
    }

    if (plan.id === 'free') {
      // Handle downgrade to free plan directly
      handlePlanUpdate(plan.id);
      return;
    }

    setSelectedPlan(plan);
    setShowPaymentModal(true);
  };

  const handlePlanUpdate = async (planId: string) => {
    setIsProcessing(true);
    try {
      const response = await fetch('/api/user/update-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }

      await refreshUserPlan();
      toast.success(`Successfully updated to ${PRICING_TIERS[planId].name} plan!`);
      setShowPaymentModal(false);
      setTestCode('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update plan');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTestPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (testCode !== '000000000') {
      toast.error('Invalid test code. Use 000000000 for test payments.');
      return;
    }

    if (!selectedPlan) return;

    await handlePlanUpdate(selectedPlan.id);
  };

  const getPlanIcon = (planId: string) => {
    switch (planId) {
      case 'starter':
        return <Zap className="h-6 w-6 text-purple-600" />;
      case 'pro':
        return <Crown className="h-6 w-6 text-yellow-600" />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-teal-50">
      <Header />
      
      <main className="container mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-teal-600 bg-clip-text text-transparent mb-4">
            Choose Your Plan
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            Unlock the full potential of AI-powered conversations
          </p>
          
          {/* Billing Toggle */}
          <div className="flex items-center justify-center gap-4 mb-8">
            <span className={billingCycle === 'monthly' ? 'font-semibold' : 'text-gray-500'}>
              Monthly
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'yearly' : 'monthly')}
              className="relative"
            >
              <div className={`w-12 h-6 rounded-full transition-colors ${
                billingCycle === 'yearly' ? 'bg-purple-600' : 'bg-gray-300'
              }`}>
                <div className={`w-5 h-5 bg-white rounded-full transition-transform transform ${
                  billingCycle === 'yearly' ? 'translate-x-6' : 'translate-x-0.5'
                } mt-0.5`} />
              </div>
            </Button>
            <span className={billingCycle === 'yearly' ? 'font-semibold' : 'text-gray-500'}>
              Yearly
            </span>
            {billingCycle === 'yearly' && (
              <Badge variant="secondary" className="ml-2">Save 30%</Badge>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {Object.values(PRICING_TIERS).map((tier) => (
            <Card 
              key={tier.id} 
              className={`relative overflow-hidden transition-all duration-300 hover:shadow-xl ${
                tier.popular ? 'ring-2 ring-purple-500 scale-105' : ''
              } ${userPlan === tier.id ? 'bg-purple-50 border-purple-200' : ''}`}
            >
              {tier.popular && (
                <div className="absolute top-0 left-0 right-0 bg-gradient-to-r from-purple-600 to-teal-600 text-white text-center py-2 text-sm font-semibold">
                  Most Popular
                </div>
              )}
              
              <CardHeader className={tier.popular ? 'pt-12' : ''}>
                <div className="flex items-center gap-3 mb-4">
                  {getPlanIcon(tier.id)}
                  <CardTitle className="text-2xl">{tier.name}</CardTitle>
                  {userPlan === tier.id && (
                    <Badge variant="default">Current Plan</Badge>
                  )}
                </div>
                
                <div className="text-center">
                  <div className="text-4xl font-bold mb-2">
                    ${billingCycle === 'yearly' ? tier.price.yearly : tier.price.monthly}
                    {tier.price.monthly > 0 && (
                      <span className="text-lg text-gray-500 font-normal">
                        /{billingCycle === 'yearly' ? 'year' : 'month'}
                      </span>
                    )}
                  </div>
                  {billingCycle === 'yearly' && tier.price.monthly > 0 && (
                    <p className="text-sm text-gray-500">
                      ${(tier.price.yearly / 12).toFixed(0)}/month billed yearly
                    </p>
                  )}
                </div>
              </CardHeader>
              
              <CardContent>
                <ul className="space-y-3 mb-8">
                  {tier.features.map((feature, index) => (
                    <li key={index} className="flex items-center gap-3">
                      <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
                
                <Button
                  onClick={() => handleSelectPlan(tier)}
                  disabled={userPlan === tier.id || isProcessing}
                  className="w-full"
                  variant={tier.popular ? 'default' : 'outline'}
                >
                  {userPlan === tier.id ? 'Current Plan' : `Select ${tier.name}`}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Test Payment Modal */}
        <Dialog open={showPaymentModal} onOpenChange={setShowPaymentModal}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Test Payment</DialogTitle>
            </DialogHeader>
            
            <form onSubmit={handleTestPayment} className="space-y-4">
              <div className="text-center py-4">
                <h3 className="text-lg font-semibold mb-2">
                  {selectedPlan?.name} Plan
                </h3>
                <p className="text-3xl font-bold text-purple-600">
                  ${billingCycle === 'yearly' ? selectedPlan?.price.yearly : selectedPlan?.price.monthly}
                  <span className="text-lg text-gray-500 font-normal">
                    /{billingCycle === 'yearly' ? 'year' : 'month'}
                  </span>
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="testCode">Test Payment Code</Label>
                <Input
                  id="testCode"
                  type="text"
                  placeholder="Enter 000000000 for test payment"
                  value={testCode}
                  onChange={(e) => setTestCode(e.target.value)}
                  required
                />
                <p className="text-xs text-gray-500">
                  This is a test environment. Use code "000000000" to simulate a successful payment.
                </p>
              </div>
              
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowPaymentModal(false)}
                  className="flex-1"
                  disabled={isProcessing}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isProcessing}
                  className="flex-1"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    'Confirm Payment'
                  )}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}