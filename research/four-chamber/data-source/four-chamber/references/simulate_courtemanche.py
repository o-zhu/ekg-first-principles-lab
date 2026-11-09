from pathlib import Path
import json, hashlib
import numpy as np
from scipy.integrate import solve_ivp
import courtemanche_generated as m
P=Path(__file__).resolve().parent
init,c=m.initConsts()
# Published parameters, 1 Hz pacing. Split at stimulus edges to resolve 2-ms pulses.
c[4]=50.;c[5]=1e9;c[6]=1000.
y=np.array(init,float)
beats=[]
for b in range(40):
    start=1000.*b
    parts=[]
    for a,z in [(start,start+50),(start+50,start+52),(start+52,start+1000)]:
        sol=solve_ivp(lambda t,y:m.computeRates(t,y,c),(a,z),y,method='BDF',rtol=2e-7,atol=2e-9,max_step=10.,dense_output=True)
        if not sol.success:raise RuntimeError(sol.message)
        y=sol.y[:,-1]
        tt=np.arange(a,z,.5)
        parts.append((tt,sol.sol(tt)))
    ts=np.concatenate([p[0] for p in parts])-start
    states=np.concatenate([p[1] for p in parts],axis=1)
    beats.append(states[0].copy())
    if b%5==4: print('completed',b+1,'beats; Vm range',float(states[0].min()),float(states[0].max()),'delta previous',float(np.max(np.abs(beats[-1]-beats[-2]))),flush=True)
np.savez_compressed(P/'courtemanche_40beats.npz',times_ms=ts,voltage_mV=states[0],all_state_values=states,previous_voltage=beats[-2],constants=c)
print('done',flush=True)
