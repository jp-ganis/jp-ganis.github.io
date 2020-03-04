function dn(n) { return Math.floor(Math.random() * n) + 1; }
function d3() { return dn(3); }
function d6() { return dn(6); }
function getIterations() { return 15000; }

// convert NaN to max value
function nanIsMax(n)
{
    if (isNaN(n)) return 99;
    if (n) return n;
	return 99;
}

// convert NaN to min value
function nanIsZero(n) {
    if (isNaN(n)) return 0;
    if (n) return n;
    return 0;
}

// encoding for things like 2d3 or 3d6
function parseDiceNumber(s)
{
	if (s == "")
	{
		return 0;
	}
	
	s = s.toLowerCase();
	var regEx = /(\d*)d(\d+)(\+(\d+))*/;
	var match = regEx.exec(s);

	if (match == null)
	{
		return parseInt(s);
	}

	var prefix = Math.max(1, nanIsZero(parseInt(match[1])));
	var suffix = nanIsZero(parseInt(match[2]));
	var addition = nanIsZero(parseInt(match[4]));

	var d = 0;

	for (var i = 0; i < prefix; ++i)
	{
		d += dn(suffix);
	}

	return d + addition;
}

// roll with rerolls
function rollWithRerolls(rollFunc, rerolls)
{
	let d = rollFunc();
		
	if (rerolls.includes(d))
	{
		d = rollFunc();
	}

	return d;
}

// checkProcRoll
function checkProcRoll(proc, modifier, roll)
{
	if (proc.Unmodified)
	{
		roll -= modifier;
	}

	return roll >= proc.Roll;
}

// processProc
function processProc(roll, modifier, proc)
{
	if (checkProcRoll(proc, modifier, roll))
	{
		return processSuccessfulProc(proc);
	}
		
	return null;
}

// processSuccessfulProc
function processSuccessfulProc(proc)
{
	let results = {};
	results.MWDamage = 0;
	results.BonusAttacks = 0;
	results.BonusHits = 0;
	results.AttackDamage = 0;
	results.Rend = 0;
	
	proc.Value = parseDiceNumber(proc.Value.toString());
	
	results.RollType = proc.Type.includes('hit') ? 'hit' : 'wound';
	
	if (proc.Type == 'mw_on_hit')
	{
		results.MWDamage = proc.Value;
		results.BonusHits = -1;
	}
	if (proc.Type == 'mw_on_hit_ADDITIONAL')
	{
		results.MWDamage = proc.Value;
	}
	else if (proc.Type == 'dmg_on_hit')
	{
		results.BonusAttackDamage = proc.Value;
	}
	else if (proc.Type == 'hits_on_hit')
	{
		results.BonusHits = proc.Value - 1; // we remove 1 so that 6s = 2 hits means 1 bonus hit, not three hits total
	}
	else if (proc.Type == 'attacks_on_hit')
	{
		results.BonusAttacks = proc.Value;
	}
	else if (proc.Type == 'rend_on_hit')
	{
		results.Rend = Math.abs(proc.Value);
	}
	else if (proc.Type == 'mw_on_wound')
	{
		results.MWDamage = proc.Value;
	}
	else if (proc.Type == 'mw_on_wound_ADDITIONAL')
	{
		results.MWDamage = proc.Value;
	}
	else if (proc.Type == 'dmg_on_wound')
	{
		results.BonusAttackDamage = proc.Value;
	}
	else if (proc.Type == 'attacks_on_wound')
	{
		results.BonusAttacks = proc.Value;
	}
	else if (proc.Type == 'rend_on_wound')
	{
		results.Rend = Math.abs(proc.Value);
	}
	
	return results;
}

// parseProcString
function parseProcString(string)
{
	let values = string.split('/');
	
	if (values[1] == 0)
	{
		return null;
	}

	let proc = {};
	proc.Type = values[0];  // e.g. mw on a hit roll of...
	proc.Roll = parseInt(values[1]); // ...6
	proc.Value = values[2]; // value of proc, 1 MW, 3 extra hits, etc
	proc.Unmodified = true;//values[3]; // for now, everything is unmodified

	return proc;
}

// accumulateProcResults
function accumulateProcResults(procResults)
{
	let result = {};
	result.MWDamage = 0;
	result.BonusAttacks = 0;
	result.BonusHits = 0;
	result.AttackDamage = 0;
	result.Rend = 0;
	
	for (let i = 0; i < procResults.length; ++i)
	{
		if (procResults[i] == null) continue;
		
		result.MWDamage		+= procResults[i].MWDamage;
		result.BonusAttacks	+= procResults[i].BonusAttacks;
		result.BonusHits	+= procResults[i].BonusHits;
		result.AttackDamage	+= procResults[i].AttackDamage;
		result.Rend			+= procResults[i].Rend;
	}
	
	return result;
}

// parseArray
function parseArray(string)
{
	if (string[0] == "[") { return JSON.parse(string); }
	else { return JSON.parse("[" + string + "]"); }
}

// parseRerolls
function parseRerolls(string, value, modifier)
{
	if (string == "none")
	{
		return [];
	}
	else if (string == "rerollOnes")
	{
		return [1];
	}
	else if (string == 'rerollFailedAll')
	{
		value -= modifier;
		string = 'rerollFailed';
	}
	else if (string == 'rerollSixes')
	{
		return [6];
	}

	if (string == 'rerollFailed')
	{
		let rerolls = [];
		value = Math.min(6, value);
		
		for (let i = 1; i < value; ++i)
		{
			rerolls.push(i);
		}
		return rerolls;
	}
	
	return parseArray(string);
}

// parseAttackString
function parseAttackString(attackString)
{
	let values = attackString.split('/');

	let attacks = values[0];
	let hitValue = parseInt(values[1]);
	let woundValue = parseInt(values[2]);
	let rendValue = nanIsZero(parseInt(values[3]));
	let damageValue = values[4];
	let rrhValue = values.length > 5 ? values[5] : "none";
	let rrwValue = values.length > 6 ? values[6] : "none";
	
	let result = 
	{
		Attacks: attacks,
		ToHit: hitValue,
		ToWound: woundValue,
		Rend: Math.abs(rendValue),
		Damage: damageValue,
		RRH: rrhValue,
		RRW: rrwValue,
		Procs: [],
	}

	return result;
}

// parseDefenceString
// first value is armor saves
// second value is mw only saves
function parseDefenceString(defenceString)
{
	let values = defenceString.split('/');

	let result = [];

	for (let i = 0; i < values.length - 2; i += 3)
	{
		let save =
		{
			Value: parseInt(values[i]),
			MWOnly: parseInt(values[i+1]),
			Rerolls: values[i+2],
		}

		result.push(save);
	}

	return result;
}

// parseModifierString
function parseModifierString(modifierString)
{
	let values = modifierString.split('/');

	let result = 
	{
		HitModifier: parseInt(values[0]),
		WoundModifier: parseInt(values[1]),
		SaveModifier: parseInt(values[2]),
		AttacksModifier: values[3],
	}

	return result;
}

// modify hitwound roll
function modifyHitWoundRoll(roll, modifier)
{
	if (roll == 1 || roll == 6) return roll;
	return roll + modifier;
}

// getAfterSaveReduction
function getAfterSaveReduction(defenceProfile, physicalDamageDone, mortalWoundDamageDone)
{
	let afterSaveReduction = 0;

	for (let i = 1; i < defenceProfile.length; ++i)
	{
		let afterSave = defenceProfile[i];

		// aftersave vs everything
		if (!afterSave.MWOnly)
		{
			for (let j = 0; j < physicalDamageDone; ++j)
			{
				let saveRoll = rollWithRerolls(d6, afterSave.Rerolls);
				if (saveRoll >= afterSave.Value)
				{
					afterSaveReduction++;
				}
			}
		}

		// aftersave vs mortal wounds
		for (let j = 0; j < mortalWoundDamageDone; ++j)
		{
			let saveRoll = rollWithRerolls(d6, afterSave.Rerolls);
			if (saveRoll >= afterSave.Value)
			{
				afterSaveReduction++;
			}
		}
	}

	return afterSaveReduction;
}

// rollToHit
function rollToHit(attackProfile, modifiers)
{
	attackProfile.RRH = parseRerolls(attackProfile.RRH, attackProfile.ToHit, modifiers.HitModifier);
	
	let roll = rollWithRerolls(d6, attackProfile.RRH);
	return modifyHitWoundRoll(roll, modifiers.HitModifier);
}

// rollToWound
function rollToWound(attackProfile, modifiers)
{
	attackProfile.RRW = parseRerolls(attackProfile.RRW, attackProfile.ToWound, modifiers.WoundModifier);
	
	let roll = rollWithRerolls(d6, attackProfile.RRW);
	return modifyHitWoundRoll(roll, modifiers.WoundModifier);
}

// rollToSave
function rollToSave(attackProfile, defenceProfile, modifiers)
{
	defenceProfile[0].Rerolls = parseRerolls(defenceProfile[0].Rerolls, defenceProfile[0].Value, -attackProfile.Rend);
	
	let roll = rollWithRerolls(d6, defenceProfile[0].Rerolls);
	
	if (roll == 1) return 1;
	
	return roll + modifiers.SaveModifier - attackProfile.Rend;
}

// rollAttack
function rollAttack(attackProfile, defenceProfile, modifiers, isBonusAttack = false)
{
	let physicalDamageDone = 0;
	let mortalWoundDamageDone = 0;
	
	let bonusAttacks = 0;
	
	// roll to hit
	let hits = [];
	let hitRoll = rollToHit(attackProfile, modifiers);
	
	let hitProcs = [];
	
	// TO HIT
	for (let i = 0; i < attackProfile.Procs.length; ++i)
	{
		let thisProc = attackProfile.Procs[i];
		if (thisProc.Type.includes('on_hit'))
		{
			hitProcs.push(processProc(hitRoll, modifiers.HitModifier, thisProc));
		}
	}
	hitProcs = accumulateProcResults(hitProcs);
	
	// bonus attacks cannot proc further bonus attacks (recursion-proofing)
	if (isBonusAttack)
	{
		hitProcs.BonusAttacks = 0;
	}
	
	let thisHit = {Rend: attackProfile.Rend, Damage: attackProfile.Damage};
	
	////////////////////////////// <PROCTYPES>
	// MWDamage 
	mortalWoundDamageDone += hitProcs.MWDamage;
	
	// BonusAttacks
	bonusAttacks += hitProcs.BonusAttacks;
	
	// BonusHits
	// this needs to not add TWO bonus hits on a proc, but rather 2 minus the original 1. (6s = 2 hits is just ONE bonus hit)
	for (let i = 0; i < hitProcs.BonusHits; ++i)
	{
		hits.push({Rend: attackProfile.Rend, Damage: attackProfile.Damage});
	}
	
	// AttackDamage 
	if (hitProcs.BonusAttackDamage > 0)
	{
		thisHit.Damage = hitProcs.BonusAttackDamage;
	}
	
	// Rend 
	if (hitProcs.Rend > 0)
	{
		thisHit.Rend = hitProcs.Rend;
	}
	////////////////////////////// <\PROCTYPES>
	
	if (hitRoll >= attackProfile.ToHit && hitProcs.BonusHits >= 0)
	{
		hits.push(thisHit);
	}
	
	// TO WOUND
	let wounds = [];
	
	for (let i = 0; i < hits.length; ++i)
	{
		let thisHit = hits[i];
		let woundRoll = rollToWound(attackProfile, modifiers);
		let woundProcs = [];
		
		for (let i = 0; i < attackProfile.Procs.length; ++i)
		{
			let thisProc = attackProfile.Procs[i];
			if (thisProc.Type.includes('on_wound'))
			{
				woundProcs.push(processProc(woundRoll, modifiers.WoundModifier, thisProc));
			}
		}
		woundProcs = accumulateProcResults(woundProcs);
		
		// bonus attacks cannot proc further bonus attacks (recursion-proofing)
		if (isBonusAttack)
		{
			woundProcs.BonusAttacks = 0;
		}
		
		////////////////////////////// <PROCTYPES>
		// MWDamage 
		mortalWoundDamageDone += woundProcs.MWDamage;
		
		// BonusAttacks
		bonusAttacks += woundProcs.BonusAttacks;
		
		// AttackDamage 
		if (woundProcs.BonusAttackDamage > 0)
		{
			thisHit.Damage = woundProcs.BonusAttackDamage;
		}
		
		// Rend 
		if (woundProcs.Rend > 0)
		{
			thisHit.Rend = woundProcs.Rend;
		}
		////////////////////////////// <\PROCTYPES>
		
		if (woundRoll >= attackProfile.ToWound)
		{
			wounds.push(thisHit);
		}
	}
	
	// TO SAVE
	let saves = 0;
	
	for (let i = 0; i < wounds.length; ++i)
	{
		let thisWound = wounds[i];
		let saveRoll = rollToSave(thisWound, defenceProfile, modifiers);
		
		if (saveRoll == 1 || saveRoll < defenceProfile[0].Value)
		{
			physicalDamageDone += parseDiceNumber(thisWound.Damage);
		}
	}
	
	// saves after save
	let afterSaveReduction = getAfterSaveReduction(defenceProfile, physicalDamageDone, mortalWoundDamageDone);

	// damage total
	let damageTotal = physicalDamageDone + mortalWoundDamageDone - afterSaveReduction;
	
	// recurse
	for (let i = 0; i < bonusAttacks; ++i)
	{
		damageTotal += rollAttack(attackProfile, defenceProfile, modifiers, true);
	}
	
	// procs
	return damageTotal;
}

// rollAttacks
function rollAttacks(attackProfiles, defenceProfile, modifiers)
{
	let damage = 0;

	for (let a = 0; a < attackProfiles.length; ++a)
	{
		let attackProfile = attackProfiles[a];
		let numAttacks = parseDiceNumber(attackProfile.Attacks);
		let bonusAttacks = parseDiceNumber(modifiers.AttacksModifier);
		
		let totalAttacks = numAttacks + bonusAttacks;
		
		for (let i = 0; i < totalAttacks; ++i)
		{
			damage += rollAttack(attackProfile, defenceProfile, modifiers);
		}
	}
	
	return damage;
}

// debug test
function debug_test()
{
	let tg_maw_proc = parseProcString('mw_on_hit/6/6/1');
	let tg_gristlegore_proc = parseProcString('hits_on_hit/6/2/1');

	let mawProfile = parseAttackString('3/4/3/-2/d6');
	mawProfile.Procs.push(tg_gristlegore_proc);
	mawProfile.Procs.push(tg_maw_proc);
	
	let clawsProfile = parseAttackString('4/4/3/-1/d3');
	clawsProfile.Procs.push(tg_gristlegore_proc);

	let defenceProfile = parseDefenceString('4/0/[]/6/0/[]');
	let modifiers = parseModifierString('0/0/0/d3');

	let s=0;
	for (let i = 0; i < 10000; ++i)
	{
		s += rollAttacks([mawProfile, clawsProfile], defenceProfile, modifiers);
	}

	console.log(s/10000)
}

function debug_test_mannfred()
{
	let attackProfile1 = parseAttackString('4/2/2/-1/d3');
	let attackProfile2 = parseAttackString('2/3/3/-1/2');
	let attackProfile3 = parseAttackString('6/4/3/-2/2');
	let attackProfile4 = parseAttackString('6/5/4/0/1');
	let mw_proc = parseProcString('mw_on_hit/6/1/1');
	attackProfile4.Procs.push(mw_proc);

	let defenceProfile = parseDefenceString('4/0/[]');
	let modifiers = parseModifierString('0/0/0/0');

	let s=0;
	for (let i = 0; i < 10000; ++i)
	{
		s += rollAttacks(attackProfile1, defenceProfile, modifiers);
		s += rollAttacks(attackProfile2, defenceProfile, modifiers);
		s += rollAttacks(attackProfile3, defenceProfile, modifiers);
		s += rollAttacks(attackProfile4, defenceProfile, modifiers);
	}

	console.log(s/10000)
}

function debug_test_sylv()
{
	let tg_maw_proc = parseProcString('mw_on_wound/6/1/1');
	let tg_gristlegore_proc = parseProcString('hits_on_hit/6/2/1');

	let attackProfile = parseAttackString('16/3/3/-1/2');
	attackProfile.Procs.push(tg_gristlegore_proc);
	attackProfile.Procs.push(tg_maw_proc);

	let defenceProfile = parseDefenceString('4/0/[]/7/0/[]');
	let modifiers = parseModifierString('0/0/0/0');

	let s=0;
	for (let i = 0; i < 10000; ++i)
	{
		s += rollAttacks(attackProfile, defenceProfile, modifiers);
	}

	console.log(s/10000)
}

function debug_test_sylv2()
{
	let tg_gristlegore_proc = parseProcString('hits_on_hit/6/2/1');

	let attackProfile = parseAttackString('18/3/3/-2/d3');
	attackProfile.Procs.push(tg_gristlegore_proc);

	let defenceProfile = parseDefenceString('4/0/[]/7/0/[]');
	let modifiers = parseModifierString('0/0/0/0');

	let s=0;
	for (let i = 0; i < 10000; ++i)
	{
		s += rollAttacks(attackProfile, defenceProfile, modifiers);
	}

	console.log(s/10000)
}