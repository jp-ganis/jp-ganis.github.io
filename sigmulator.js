function d3() { return Math.floor(Math.random() * 3)+1 }
function d6() { return Math.floor(Math.random() * 6)+1 }

var Attack = {
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
	hitRoll: function () { return d6() + this.hitModifier; },
	woundRoll: function () { return d6() + this.woundModifier; },
	saveRoll: function () { return d6() + this.saveModifier; },
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
		var h = this.hitRoll();
		if (h >= this.toHit) return 1;
		else if (this.hitRerolls.indexOf(h) >= 0 && d6() >= this.toHit) return 1;
		return 0;
	},
	rollToWound: function() {
		var w = this.woundRoll();
		if (w >= this.toWound) return 1;
		else if (this.woundRerolls.indexOf(w) >= 0 && d6() >= this.toWound) return 1;
		return 0;
	},
	rollToSave: function() {
		var s = this.saveRoll();
		if (s >= this.toSave) return 1;
		else if (this.saveRerolls.indexOf(s) >= 0 && d6() >= this.Save) return 1;
		return 0;
	},
	rollDamage: function() {
		var d = this.damageRoll() + this.damageProc;
		this.damageProc = 0;
		return d;
	},

	// resolve
	resolve: function() {
		for (var a = 0; a < this.attacks; a++) this.hits += this.rollToHit();
		for (var h = 0; h < this.hits; h++) this.wounds += this.rollToWound();
		for (var w = 0; w < this.wounds; w++) this.saves += this.rollToSave();
		for (var s = 0; s < this.saves; s++) this.damageDone += this.rollDamage();
		var retVal = this.damageDone;
		this.hits = 0;
		this.wounds = 0;
		this.saves = 0;
		this.damageDone = 0;
		return retVal;
	},

}

// at least function
function atLeast(attack) {
	var iterations=5000;
	d = [];
	e = [];
	for (var a = 0; a < 500; a++) d[a] = 0;
	for (var i = 0; i < iterations; i++)
	{
		dmg = attack.resolve();
		for (var j = 0; j < dmg; j++) d[j]++;
	}
	for (var i = 0; i < d.length; i++)
	{
		d[i] = Math.floor(d[i]/iterations*100);
		if (d[i] == 0) continue;
		e[i] = d[i];
	}
	return e;
}
function pad(num, size) {
	var s = num+"";
	while (s.length < size) s = "0" + s;
	return s;
}

// fancyPrint
function fancyPrint(d) {
	var retString = "";
	for (var i = 0; i < d.length; i++)
	{
		var damage = pad(i, 3);
		var lines = Array(d[i]+1).join("|");
		var percent = d[i].toString();
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

function fancyResolve(a, h, w, r, d, s)
{
	Attack.attacks = a;
	Attack.toHit = h;
	Attack.toWound = w;
	Attack.rend = r;
	Attack.damage = d;
	Attack.toSave = s;
	return fancyPrint(atLeast(Attack));
}


