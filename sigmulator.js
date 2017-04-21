function d3() { return Math.floor(Math.random() * 3)+1 }
function d6() { return Math.floor(Math.random() * 6)+1 }

function createAttack() {
    let Attack = {
        attacks: 0,
        toHit: 0,
        toWound: 0,
        toSave: 0,
        rend: 0,
        damage: 0,
        hits: 0,
        wounds: 0,
        saves: 0,
        hitRerolls: [],
        woundRerolls: [],
        saveRerolls: [],
        damageDone: 0,
        damageProc: 0,
        hitModifier: 0,
        woundModifier: 0,
        saveModifier: 0,
        mortalDamageDone: 0,

        //basic rolls
        hitRoll: function () {
            let roll = d6();
            if (this.hitRerolls.indexOf(roll) >= 0) return d6();
            return roll;
        },
        woundRoll: function () {
            let roll = d6();
            if (this.woundRerolls.indexOf(roll) >= 0) return d6();
            return roll;
        },
        saveRoll: function () {
            let roll = d6();
            if (this.saveRerolls.indexOf(roll) >= 0) return d6();
            return roll;
        },
        damageRoll: function (inDamage) {
            if (inDamage == 8) return d6();
            else if (inDamage == 7) return d3();
            return inDamage;
        },

        // proc effects
        extraMwDamage: null,
        extraDamage: null,
        extraHits: null,
        extraAttacks: null,

        extraMwOnHit: null,
        extraDamageOnHit: null,
        extraHitsOnHit: null,
        extraAttacksOnHit: null,

        extraMwOnWound: null,
        extraDamageOnWound: null,
        extraAttacksOnWound: null,

        checkForHitProcs: function (roll)
        {
            if (this.extraMwOnHit && roll >= this.extraMwOnHit) {
                this.mortalDamageDone += this.damageRoll(this.extraMwDamage);
                return 0;
            }
            if (this.extraDamageOnHit && roll >= this.extraDamageOnHit) {
                this.damageProc = this.damageRoll(this.extraDamage);
                return 1;
            }
            if (this.extraHitsOnHit && roll >= this.extraHitsOnHit) {
                return this.damageRoll(this.extraHits);
            }
            if (this.extraAttacksOnHit && roll >= this.extraAttacksOnHit) {
                let newHits = 1;
                for (let h = 0; h < this.extraAttacks; h++) newHits += this.rollToHit();
                return newHits;
            }
            return -1;
        },
        checkForWoundProcs: function (roll) {
            if (this.extraMwOnWound && roll >= this.extraMwOnWound) {
                this.mortalDamageDone += this.damageRoll(this.extraMwDamage);
                return 0;
            }
            if (this.extraDamageOnWound && roll >= this.extraDamageOnWound) {
                this.damageProc = this.damageRoll(this.extraDamage);
                return 1;
            }
            if (this.extraAttacksOnHit && roll >= this.extraAttacksOnHit) {
                let newHits = 0;
                let newWounds = 1;
                for (let h = 0; h < this.extraAttacks; h++) newHits += this.rollToHit();
                for (let w = 0; w < newHits; w++) newWounds += this.rollToWound();
                return newWounds;
            }
        },

        // checked rolls
        rollToHit: function () {
            let h = this.hitRoll();
            if (h == 1) return 0;
            h += this.hitModifier;
            let procHits = this.checkForHitProcs(h);
            if (procHits > -1) return procHits;
            else if (h >= this.toHit) return 1;
            return 0;
        },
        rollToWound: function () {
            let w = this.woundRoll();
            if (w == 1) return 0;
            w += this.woundModifer;
            let procWounds = this.checkForWoundProcs(w);
            if (procWounds > -1) return procWounds;
            else if (w >= this.toWound) return 1;
            return 0;
        },
        rollToSave: function () {
            let s = this.saveRoll();
            if (s == 1) return 0;
            if (s + this.saveModifier - Math.abs(this.rend) >= this.toSave) return 1;
            return 0;
        },
        rollDamage: function () {
            if (this.damageProc > 0) d = this.damageProc;
            else d = this.damageRoll(this.damage);

            this.damageProc = 0;
            return d;
        },
        rollToWard: function () {
            if (d6() >= this.wardSave) return 1;
            return 0;
        },
        rollToMortalWard: function () {
            if (d6() >= this.mortalWardSave) return 1;
            return 0;
        },

        // resolve
        resolve: function () {
            for (let a = 0; a < this.attacks; a++) this.hits += this.rollToHit();
            for (let h = 0; h < this.hits; h++) this.wounds += this.rollToWound();
            for (let w = 0; w < this.wounds; w++) this.saves += this.rollToSave();
            for (let s = 0; s < (this.wounds - this.saves); s++) {
                let localDamage = this.rollDamage();
                for (let w = 0; w < localDamage; w++) localDamage -= this.rollToWard();
                this.damageDone += localDamage;
            }
            for (let w = 0; w < this.mortalDamageDone; w++) this.mortalDamageDone -= this.rollToMortalWard();

            let retVal = this.damageDone + this.mortalDamageDone;
            this.hits = 0;
            this.wounds = 0;
            this.saves = 0;
            this.damageDone = 0;
            this.mortalDamageDone = 0;
            return retVal;
        },
    }

    return Attack;
}

// at least function
function atLeast(attack) {
	let iterations=15000;
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
function pad(num, size) {
	let s = num+"";
	while (s.length < size) s = "0" + s;
	return s;
}

function rerollsMatch(arr1, arr2)
{
    return JSON.stringify(arr1.sort()) === JSON.stringify(arr2.sort());
}

// fancyPrint
function fancyPrint(d) {
	let retString = "";
	for (let i = 1; i < d.length; i++)
	{
        let damage = pad(i, 2);
        let lines = Array(d[i] + 1).join("|");
		let percent = d[i].toString();
		retString = retString.concat(damage);
		retString = retString.concat(" ");
		retString = retString.concat(lines);
		retString = retString.concat(" ");
		retString = retString.concat(percent);
		retString = retString.concat("%");
		retString = retString.concat("\n");
	}
	return retString;
}

function getSymbols()
{
    symbols = ["|", ")", "]", ">", "}"];
    return symbols;
}


// comparative processing
function getCompareString(a, b)
{
    let symbols = getSymbols();
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
        aString = aString.concat(a.hitModifier);
        aString = aString.concat(" hit mod ");
        bString = bString.concat(b.hitModifier);
        bString = bString.concat(" hit mod ");
    }

    // wound mod
    if (a.woundModifier != b.woundModifier) {
        aString = aString.concat(a.woundModifier);
        aString = aString.concat(" wound mod ");
        bString = bString.concat(b.woundModifier);
        bString = bString.concat(" wound mod ");
    }

    // save mod
    if (a.saveModifier != b.saveModifier) {
        aString = aString.concat(a.saveModifier);
        aString = aString.concat(" save mod ");
        bString = bString.concat(b.saveModifier);
        bString = bString.concat(" save mod ");
    }
    
    // hit rerolls
    if (a.hitRerolls != b.hitRerolls) {
        aString = aString.concat(" rerolling ");
        aString = aString.concat(a.hitRerolls);
        aString = aString.concat(" to hit ");
        bString = bString.concat(" rerolling ");
        bString = bString.concat(a.hitRerolls);
        bString = bString.concat(" to hit ");
    }

    // wound rerolls
    if (a.woundRerolls != b.woundRerolls) {
        aString = aString.concat(" rerolling ");
        aString = aString.concat(a.woundRerolls);
        aString = aString.concat(" to wound ");
        bString = bString.concat(" rerolling ");
        bString = bString.concat(a.woundRerolls);
        bString = bString.concat(" to wound ");
    }

    // save rerolls
    if (a.saveRerolls != b.saveRerolls) {
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

    aString = aString.concat(" vs ");
    aString = aString.concat(bString);
    return aString;

}


// comparative print
function multiPrint() {
    let symbols = getSymbols();
    let retString = "";
    let damages = [].slice.call(arguments).sort(function (a, b) { return a.length - b.length; })

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

        retString = retString.concat("\n");
    }
    return retString;
}

function nanIsMax(n)
{
    if (isNaN(n)) return 99;
    if (n) return n;
	return 99;
}
function nanIsZero(n) {
    if (isNaN(n)) return 0;
    if (n) return n;
    return 0;
}

function newAttack(a, h, w, r, d, s, hm, wm, sm, hrr, wrr, srr, ward, mwOnly, models, procType, procRoll, procValue)
{
    let Attack = createAttack();

    Attack.attacks = nanIsZero(a);
    if (models) Attack.attacks *= models;

    Attack.toHit = nanIsMax(h);
    Attack.toWound = nanIsMax(w);
    Attack.damage = nanIsMax(d);
    Attack.toSave = nanIsMax(s);
    if (mwOnly) Attack.mortalWardSave = nanIsMax(ward);
    else Attack.wardSave = nanIsMax(ward);

    Attack.rend = nanIsZero(r);
    Attack.hitModifier = nanIsZero(hm);
    Attack.woundModifer = nanIsZero(wm);
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

        // default
        default:
            break;
    }

    if (hrr) Attack.hitRerolls = hrr.split(/[ ,]+/).map(Number);
    if (wrr) Attack.woundRerolls = wrr.split(/[ ,]+/).map(Number);
    if (srr) Attack.saveRerolls = srr.split(/[ ,]+/).map(Number);

    return Attack;
}
