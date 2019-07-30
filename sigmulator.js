function dn(n) { return Math.floor(Math.random() * n) + 1; }
function d3() { return dn(3); }
function d6() { return dn(6); }
function getIterations() { return 15000; }

// encoding for things like 2d3 or 3d6
function parseDiceNumber(s)
{
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

// reroll under value
function rollWithRerollUnderValue(rollFunc, value)
{
	let d = rollFunc();

	if (d < value)
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

	let proc = {};
	proc.Type = values[0];  // e.g. mw on a hit roll of...
	proc.Roll = parseInt(values[1]); // ...6
	proc.Value = values[2]; // value of proc, 1 MW, 3 extra hits, etc
	proc.Unmodified = values[3]; 

	return proc;
}

// accumuluateProcResults
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
	let rerolls = [];
	
	if (string == 'failed')
	{
		for (let i = 1; i < value; ++i)
		{
			rerolls.push(i);
		}
	}
	else
	{
		return parseArray(string);
	}
}

// parseAttackString
function parseAttackString(attackString)
{
	let values = attackString.split('/');

	let attacks = values[0];
	let hitValue = parseInt(values[1]);
	let woundValue = parseInt(values[2]);
	let rendValue = parseInt(values[3]);
	let damageValue = values[4];
	let rrhValue = values.length > 5 ? parseRerolls(values[5]) : [];
	let rrwValue = values.length > 6 ? parseRerolls(values[6]) : [];

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
			Rerolls: parseArray(values[i+2]),
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
	let roll = rollWithRerolls(d6, attackProfile.RRH);
	return modifyHitWoundRoll(roll, modifiers.HitModifier);
}

// rollToWound
function rollToWound(attackProfile, modifiers)
{
	let roll = rollWithRerolls(d6, attackProfile.RRW);
	return modifyHitWoundRoll(roll, modifiers.WoundModifier);
}

// rollToSave
function rollToSave(attackProfile, defenceProfile, modifiers)
{
	let roll = rollWithRerolls(d6, defenceProfile[0].Rerolls);
	
	if (roll == 1) return 1;
	
	return roll + modifiers.SaveModifier - attackProfile.Rend;
}

// rollAttack
function rollAttack(attackProfile, defenceProfile, modifiers, isBonusAttack = false)
{
	let physicalDamageDone = 0;
	let mortalWoundDamageDone = 0;
	let thisAttackDamage = parseDiceNumber(attackProfile.Damage);
	let thisAttackRend = attackProfile.Rend;
	
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
function rollAttacks(attackProfile, defenceProfile, modifiers)
{
	let damage = 0;
	let numAttacks = parseDiceNumber(attackProfile.Attacks);
	let bonusAttacks = parseDiceNumber(modifiers.AttacksModifier);
	
	let totalAttacks = numAttacks + bonusAttacks;
	
	for (let i = 0; i < totalAttacks; ++i)
	{
		damage += rollAttack(attackProfile, defenceProfile, modifiers);
	}
	
	return damage;
}

// debug test
function debug_test()
{
	let tg_maw_proc = parseProcString('mw_on_hit/6/6/1');
	let tg_gristlegore_proc = parseProcString('hits_on_hit/6/2/1');
	let fakeattack = parseProcString('attacks_on_wound/2/1/1');

	let attackProfile = parseAttackString('3/4/3/-2/d6');
	attackProfile.Procs.push(tg_gristlegore_proc);
	// attackProfile.Procs.push(tg_maw_proc);
	// attackProfile.Procs.push(fakeattack);

	let defenceProfile = parseDefenceString('4/0/[]/6/0/[]');
	let modifiers = parseModifierString('0/0/0/d3');

	let s=0;
	for (let i = 0; i < 10000; ++i)
	{
		s += rollAttacks(attackProfile, defenceProfile, modifiers);
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

debug_test_sylv()
debug_test_sylv2()

// need to be able to do failed rerolls AND reroll 6s (nice to have probably)
// specify number of simulations
// multiple comparisons
// attack strings, that are savable with unit names for a local user (also can share a direct link with people in a chat)
// scaling parameters: e.g. scaling with buffs, debuffs, saves
// unmodified options
// multiple procs
// reroll failed (with failed in wording)
// reroll failed (with reroll all in wording)
// reroll all (fish for value)
// "chance to kill" - where you fill in number of wounds 
// target dummies for change to kill: 40 plaguemonks, nagash, terrorgheist, stardrake, sequiturs, etc
// single roll mode! see what happened this time
// add tickbox to enable/disable procs/weapons etc
// add some default target dummies that we see in the game
// add some examples where you click a button and it shows a unit name, describes what procs do, etc
// add double pilein
// rerollable ward
// clear button for procs
// ability to remove procs
// need to actually make custom rerolls work
// save previous sims, be able to compare any of them
// change confidence intervals

// at least function
function atLeast(attack) {
	let iterations = getIterations();
	let d = [];
	let e = [];
	for (let a = 0; a < 500; a++) d[a] = 0;
	for (let i = 0; i < iterations; i++)
    {
        dmg = attack.resolve();
        for (let j = 0; j < dmg; j++) d[j]++;
    }
	for (let i = 0; i < d.length; i++)
	{
		d[i] = Math.floor(d[i]/iterations*100);
		if (d[i] == 0) continue;
		e[i] = d[i];
    }
	return e;
}

// at least function for multiple attacks
function multiLeast(attacks) {
	let iterations = getIterations();
	let d = [];
	let e = [];
	for (let a = 0; a < 500; a++) d[a] = 0;
	for (let i = 0; i < iterations; i++)
    {
		let dmg = 0;
		for (let attackIndex = 0; attackIndex < attacks.length; attackIndex++)
		{
			dmg += attacks[attackIndex].resolve();
		}
		
        for (let j = 0; j < dmg; j++) d[j]++;
    }
	for (let i = 0; i < d.length; i++)
	{
		d[i] = Math.floor(d[i]/iterations*100);
		if (d[i] == 0) continue;
		e[i] = d[i];
    }
	return e;
}

// pad number for prettyprint
function pad(num, size) {
	let s = num+"";
	while (s.length < size) s = "0" + s;
	return s;
}

// check if arrays match
function rerollsMatch(arr1, arr2)
{
    return JSON.stringify(arr1.sort()) === JSON.stringify(arr2.sort());
}

// fancyPrint
function fancyPrint(d) {
    let retString = "";
    let s = getSymbols()[0];
	for (let i = 0; i < d.length; i++)
	{
        let damage = pad(i + 1, 2);
        let lines = Array(d[i] + 1).join(s);
		let percent = d[i].toString();
		retString = retString.concat(damage);
		retString = retString.concat(" ");
		retString = retString.concat(lines);
		retString = retString.concat(" ");
		retString = retString.concat(percent);
		retString = retString.concat("%");
		retString = retString.concat("<br>");
	}
	return retString;
}

// symbols for pretty print
function getSymbols()
{
    symbols = ["<span style=\"color: blue\">|</span>", "<span style=\"color: red\">|</span>", "<span style=\"color: green\">|</span>", "<span style=\"color: indigo\">|</span>", "<span style=\"color: slategray\">|</span>"];
    return symbols;
}

// comparative processing
function rerollCompare(a,b)
{
	return a.sort().join(',')=== b.sort().join(',');
}

// get strings to differentiate in compare (doesn't work lol)
function getCompareString(a, b, aSymbol, bSymbol)
{
    let aString = "";
    let bString = "";

    // attacks
    if (a.attacks != b.attacks)
    {
        aString = aString.concat(a.attacks);
        aString = aString.concat(" attacks ");
        bString = bString.concat(b.attacks);
        bString = bString.concat(" attacks ");
    }

    // toHit
    if (a.toHit != b.toHit) {
        aString = aString.concat(a.toHit);
        aString = aString.concat(" to hit ");
        bString = bString.concat(b.toHit);
        bString = bString.concat(" to hit ");
    }

    // toWound
    if (a.toWound != b.toWound) {
        aString = aString.concat(a.toWound);
        aString = aString.concat(" to wound ");
        bString = bString.concat(b.toWound);
        bString = bString.concat(" to wound ");
    }

    // rend
    if (a.rend != b.rend) {
        aString = aString.concat(a.rend);
        aString = aString.concat(" rend ");
        bString = bString.concat(b.rend);
        bString = bString.concat(" rend ");
    }

    // damage
    if (a.toSave != b.toSave) {
        aString = aString.concat(a.toSave);
        aString = aString.concat(" to save ");
        bString = bString.concat(b.toSave);
        bString = bString.concat(" to save ");
    }

    // ward save
    if (a.wardSave != b.wardSave) {
        aString = aString.concat(a.wardSave);
        aString = aString.concat(" ward ");
        bString = bString.concat(b.wardSave);
        bString = bString.concat(" ward ");
    }

    // mortal ward save
    if (a.mortalWardSave != b.mortalWardSave) {
        aString = aString.concat(a.mortalWardSave);
        aString = aString.concat(" mortal ward ");
        bString = bString.concat(b.mortalWardSave);
        bString = bString.concat(" mortal ward ");
    }

    // hit mod
    if (a.hitModifier != b.hitModifier) {
				if (a.hitModifier > 0) aString = aString.concat("+");
        aString = aString.concat(a.hitModifier);
        aString = aString.concat(" to hit ");
				if (b.hitModifier > 0) bString = bString.concat("+");
        bString = bString.concat(b.hitModifier);
        bString = bString.concat(" to hit ");
    }

    // wound mod
    if (a.woundModifier != b.woundModifier) {
				if (a.woundModifier > 0) aString = aString.concat("+");
        aString = aString.concat(a.woundModifier);
        aString = aString.concat(" to wound ");
				if (b.woundModifier > 0) bString = bString.concat("+");
        bString = bString.concat(b.woundModifier);
        bString = bString.concat(" to wound ");
    }

    // save mod
    if (a.saveModifier != b.saveModifier) {
				if (a.saveModifier > 0) aString = aString.concat("+");
        aString = aString.concat(a.saveModifier);
        aString = aString.concat(" to save ");
				if (b.saveModifier > 0) bString = bString.concat("+");
        bString = bString.concat(b.saveModifier);
        bString = bString.concat(" to save ");
    }
    
    // hit rerolls
    if (!(rerollCompare(a.hitRerolls, b.hitRerolls))) {
        aString = aString.concat(" rerolling ");
        aString = aString.concat(a.hitRerolls);
        aString = aString.concat(" to hit ");
        bString = bString.concat(" rerolling ");
        bString = bString.concat(a.hitRerolls);
        bString = bString.concat(" to hit ");
    }

    // wound rerolls
    if (!(rerollCompare(a.woundRerolls, b.woundRerolls))) {
        aString = aString.concat(" rerolling ");
        aString = aString.concat(a.woundRerolls);
        aString = aString.concat(" to wound ");
        bString = bString.concat(" rerolling ");
        bString = bString.concat(a.woundRerolls);
        bString = bString.concat(" to wound ");
    }

    // save rerolls
    if (!(rerollCompare(a.saveRerolls, b.saveRerolls))) {
        aString = aString.concat(" rerolling ");
        aString = aString.concat(a.saveRerolls);
        aString = aString.concat(" to save ");
        bString = bString.concat(" rerolling ");
        bString = bString.concat(a.saveRerolls);
        bString = bString.concat(" to save ");
    }

    // mw on hit
    if (a.mwOnHit != b.mwOnHit) {
        aString = aString.concat(" mw on hits of ");
        aString = aString.concat(a.mwOnHit);
        bString = bString.concat(" mw on hits of ");
        bString = bString.concat(b.mwOnHit);
    }
    // dmg on hit
    if (a.extraDamageOnHit != b.extraDamageOnHit) {
        aString = aString.concat(" extra damage on hits of ");
        aString = aString.concat(a.extraDamageOnHit);
        bString = bString.concat(" extra damage on hits of ");
        bString = bString.concat(b.extraDamageOnHit);
    }
    // hits on hit
    if (a.extraHitsOnHit != b.extraHitsOnHit) {
        aString = aString.concat(" extra hits on hits of ");
        aString = aString.concat(a.extraHitsOnHit);
        bString = bString.concat(" extra hits on hits of ");
        bString = bString.concat(b.extraHitsOnHit);
    }
    // attacks on hit
    if (a.extraAttacksOnHit != b.extraAttacksOnHit) {
        aString = aString.concat(" extra attacks on hits of ");
        aString = aString.concat(a.extraAttacksOnHit);
        bString = bString.concat(" extra attacks on hits of ");
        bString = bString.concat(b.extraAttacksOnHit);
    }
    // mw on Wound
    if (a.mwOnWound != b.mwOnWound) {
        aString = aString.concat(" mw on Wounds of ");
        aString = aString.concat(a.mwOnWound);
        bString = bString.concat(" mw on Wounds of ");
        bString = bString.concat(b.mwOnWound);
    }
    // dmg on Wound
    if (a.extraDamageOnWound != b.extraDamageOnWound) {
        aString = aString.concat(" extra damage on Wounds of ");
        aString = aString.concat(a.extraDamageOnWound);
        bString = bString.concat(" extra damage on Wounds of ");
        bString = bString.concat(b.extraDamageOnWound);
    }
    // attacks on Wound
    if (a.extraAttacksOnWound != b.extraAttacksOnWound) {
        aString = aString.concat(" extra attacks on Wounds of ");
        aString = aString.concat(a.extraAttacksOnWound);
        bString = bString.concat(" extra attacks on Wounds of ");
        bString = bString.concat(b.extraAttacksOnWound);
    }

		if (aString === "") return "";
		aString = aString.concat(aSymbol);
		bString = bString.concat(bSymbol);
    aString = aString.concat(" vs ");
    aString = aString.concat(bString);
    return aString;
}

// compare two arrays of damage and see which is "better" ( also probably doesn't work )
function getBiggerDamage(a, b)
{
    if (a.length > b.length) return 0;
    if (a.length == b.length && a[a.length - 1] > b[b.length - 1]) return 0;
    return 1;
}

// get string for two outputs at once 
function actuallyCompare(a, b)
{
	let symbols = getSymbols()
	let aDamage = atLeast(a);
	let bDamage = atLeast(b);
	let aSymbol = symbols[0];
	let bSymbol = symbols[1];

    if (getBiggerDamage(aDamage, bDamage) < 1)
    {
		aSymbol = symbols[1];
		bSymbol = symbols[0];
	}

	let displayString = getCompareString(a, b, aSymbol, bSymbol);
	displayString = displayString.concat("<br>");
	return displayString.concat(multiPrint(aDamage, bDamage));
}

// get string for summed outputs
function getSumDamageString(a, b)
{
	let iterations = getIterations() * 2;
	let aDamage = atLeast(a);
	let bDamage = atLeast(b);
	let cDamage = aDamage;
	
	if (getBiggerDamage(aDamage, bDamage) == 1)	cDamage = bDamage;
	
	let d = [];
	let e = [];
	
	// initialize damages to zero
	for (let a = 0; a < 500; a++) d[a] = 0;

	// because we can't just add probabilities...
	for (let i = 0; i < cDamage.length; i++)
	{
		let ap = 0;
		let bp = 0;
		
		if (i < aDamage.length) ap = aDamage[i]*0.01;
		if (i < bDamage.length) bp = bDamage[i]*0.01;
		
		d[i] = Math.floor((ap + bp - ap * bp) * 100); 
		if (d[i] == 0) continue;
		e[i] = d[i];
	}
	
	return fancyPrint(e);
}

// get string for more than 2 summed outputs
function getMultiSumDamageString(l)
{
	let d = [];
	let e = [];
	
	for (let i = 0; i < 500; i++) d[i] = 0;
	
	for (let i = 0; i < l.length; i++)
	{
		let aAttack = l[i];
		let a = atLeast(aAttack);
		
		for (let j = 0; j < 500; j++)
		{
			let ap = 0;
			if (j < a.length) ap = a[j] * 0.01;
			
			d[j] = ap + d[j] - ap * d[j]; 
		}
	}
	
	for (let i = 0; i < d.length; i++)
	{
		if (d[i] != 0) e[i] = Math.floor(d[i]*100);
	}
	
	return fancyPrint(multiLeast(l));
}

// comparative print
function multiPrint() {
    let symbols = getSymbols();
    let retString = "";
    let damages = [].slice.call(arguments).sort(function (a, b) { if (a.length != b.length) return a.length - b.length; return a[a.length-1] - b[b.length-1]; })

    // foreach damage value in the biggest damage array
    for (let i = 1; i < damages[damages.length - 1].length; i++) {
        let damage = pad(i, 2);
        let total = 0; // total lines used
        let percents = [];
        retString = retString.concat(damage);
        retString = retString.concat(" ");

        // foreach damage array
        for (let j = 0; j < damages.length; j++) {
            if (damages[j].length < i) continue;
            let d = damages[j];

            let numLines = (d[i] + 1) - total;
            if (!numLines || numLines <= 0) continue;
            total += d[i] + 1;

            let lines = Array(numLines).join(symbols[j]);
            retString = retString.concat(lines);

            let percent = d[i].toString();
            percents.push(percent);
            percents.push(symbols[j]);
        }
        retString = retString.concat(" ");

        for (let p = 0; p < percents.length; p += 2) {
            retString = retString.concat(percents[p]);
            retString = retString.concat(percents[p + 1]);
            retString = retString.concat("% ");
        }

        retString = retString.concat("<br>");
    }

    return retString;
}

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

// create a new attack from parameters
function newAttack(a, h, w, r, d, s, hm, wm, sm, hrr, wrr, srr, ward, mwOnly, models, procType, procRoll, procValue)
{
    let Attack = createAttack();

    Attack.attacks = nanIsZero(a);
    Attack.models = nanIsZero(models);

    Attack.toHit = nanIsMax(h);
    Attack.toWound = nanIsMax(w);
    Attack.damage = nanIsMax(d);
    Attack.toSave = nanIsMax(s);
    if (mwOnly) Attack.mortalWardSave = nanIsMax(ward);
    else Attack.wardSave = nanIsMax(ward);

    Attack.rend = nanIsZero(r);
    Attack.hitModifier = nanIsZero(hm);
    Attack.woundModifier = nanIsZero(wm);
    Attack.saveModifier = nanIsZero(sm);

    switch (procType) {
        // on hit
        case "mwOnHit":
            Attack.extraMwOnHit = procRoll;
            Attack.extraMwDamage = procValue;
            break;
        case "dmgOnHit":
            Attack.extraDamageOnHit = procRoll;
            Attack.extraDamage = procValue;
            break;
        case "hitsOnHit":
            Attack.extraHitsOnHit = procRoll;
            Attack.extraHits = procValue;
            break;
        case "attacksOnHit":
            Attack.extraAttacksOnHit = procRoll;
            Attack.extraAttacks = procValue;
            break;
        case "rendOnHit":
            Attack.extraRendOnHit = procRoll;
            Attack.extraRend = Math.abs(procValue);
            break;

        // on wound
        case "mwOnWound":
            Attack.extraMwOnWound = procRoll;
            Attack.extraMwDamage = procValue;
            break;
        case "dmgOnWound":
            Attack.extraDamageOnWound = procRoll;
            Attack.extraDamage = procValue;
            break;
        case "attacksOnWound":
            Attack.extraAttacksOnWound = procRoll;
            Attack.extraAttacks = procValue;
            break;
        case "rendOnWound":
            Attack.extraRendOnWound = procRoll;
            Attack.extraRend = Math.abs(procValue);
            break;

        // default
        default:
            break;
    }

    if (hrr) Attack.hitRerolls = hrr.split(/[ ,]+/).map(Number);
    if (wrr) Attack.woundRerolls = wrr.split(/[ ,]+/).map(Number);
    if (srr) Attack.saveRerolls = srr.split(/[ ,]+/).map(Number);

    return Attack;
}
