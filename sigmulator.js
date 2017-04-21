function d3() { return Math.floor(Math.random() * 3)+1 }
function d6() { return Math.floor(Math.random() * 6)+1 }

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

	damageRoll: function () {
		switch(this.damage) {
			case 8:
				return d6();
				break;
			case 7:
				return d3();
				break;
			default:
				return this.damage;
		}
	},
	
	// checked rolls
	rollToHit: function() {
		let h = this.hitRoll();
        if (h == 1) return 0;
        if (h + this.hitModifier >= this.toHit) return 1;
		return 0;
	},
	rollToWound: function() {
		let w = this.woundRoll();
        if (w == 1) return 0;
        if (w + this.woundModifer >= this.toWound) return 1;
		return 0;
	},
	rollToSave: function() {
		let s = this.saveRoll();
        if (s == 1) return 0;
        if (s + this.saveModifier - Math.abs(this.rend) >= this.toSave) return 1;
		return 0;
	},
	rollDamage: function() {
		let d = this.damageRoll() + this.damageProc;
		this.damageProc = 0;
		return d;
    },
    rollToWard: function () {
        if (d6() >= this.wardSave) return 1;
        return 0;
    },

	// resolve
	resolve: function() {
		for (let a = 0; a < this.attacks; a++) this.hits += this.rollToHit();
		for (let h = 0; h < this.hits; h++) this.wounds += this.rollToWound();
		for (let w = 0; w < this.wounds; w++) this.saves += this.rollToSave();
        for (let s = 0; s < (this.wounds - this.saves); s++) {
            let localDamage = this.rollDamage();
            for (let w = 0; w < localDamage; w++) localDamage -= this.rollToWard();
            this.damageDone += localDamage;
        }
		let retVal = this.damageDone;
		this.hits = 0;
		this.wounds = 0;
		this.saves = 0;
		this.damageDone = 0;
		return retVal;
	},

}

// at least function
function atLeast(attack) {
	let iterations=15000;
	d = [];
	e = [];
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

// fancyPrint
function fancyPrint(d) {
	let retString = "";
	for (let i = 1; i < d.length; i++)
	{
		let damage = pad(i, 2);
		let lines = Array(d[i]+1).join("|");
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


function fancyResolve(a, h, w, r, d, s, hm, wm, sm, hrr, wrr, srr, ward)
{
    Attack.attacks = nanIsZero(a);

	Attack.toHit = nanIsMax(h);
    Attack.toWound = nanIsMax(w);
    Attack.rend = nanIsZero(r);
	Attack.damage = nanIsMax(d);
    Attack.toSave = nanIsMax(s);

    Attack.hitModifier = nanIsZero(hm);
    Attack.woundModifer = nanIsZero(wm);
    Attack.saveModifier = nanIsZero(sm);

    Attack.wardSave = nanIsMax(ward);

    if (hrr) Attack.hitRerolls = hrr.split(",").map(Number);
    else Attack.hitRerolls = [];

    if (wrr) Attack.woundRerolls = wrr.split(",").map(Number);
    else Attack.woundRerolls = [];

    if (srr) Attack.saveRerolls = srr.split(",").map(Number);
    else Attack.saveRerolls = [];

	return fancyPrint(atLeast(Attack));
}
