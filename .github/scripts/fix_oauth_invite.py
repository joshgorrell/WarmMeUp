from pathlib import Path

p = Path('app/(auth)/register.tsx')
s = p.read_text()
old = """        if (registrationComplete) {
          // Returning user — go through normal transition routing.
          router.replace('/transition');
          return;
        }
"""
new = """        if (registrationComplete) {
          // Returning users may still be arriving from a partner invite. Redeem
          // that invite before normal transition routing so an existing account
          // can pair without being asked for the code a second time.
          const storedCode = await loadPendingCode();
          const codeToRedeem = pendingCode || storedCode || '';
          if (codeToRedeem) {
            const result = await completePendingJoin(codeToRedeem);
            if (result.ok) {
              await clearPendingCode();
              router.replace({
                pathname: '/(auth)/paired-celebration',
                params: {
                  partnerName: result.inviterName || '',
                  partnerAvatar: result.inviterAvatar || '',
                },
              });
              return;
            }
            if (isDefinitiveJoinFailure(result.reason)) {
              await clearPendingCode();
            }
          }

          router.replace('/transition');
          return;
        }
"""
if old not in s:
    raise SystemExit('registrationComplete return block not found')
p.write_text(s.replace(old, new, 1))
