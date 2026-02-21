#!/usr/bin/env node

var primesieve = (function() {
    "use strict";
    var Primesieve = {};
    Primesieve.version = "0.0.1";
    var primelimit = 0;
    var buffer;
    var primesieve;
    var primesizelimit = 0x800000; // 1 megabyte

    // works with normal arrays, too
    if (typeof Uint32Array === 'undefined') Uint32Array = Array;

    // 30*log(113)/113 see also http://oeis.org/A209883
    var LN_113 = 1.25505871293247979696870747618124469168920275806274;
    // Rosser, J. B. and Schoenfeld, L. "Approximate Formulas for Some
    // Functions of Prime Numbers." Illinois J. Math. 6, 64-97, 1962
    // http://projecteuclid.org/DPubS?service=UI&version=1.0&verb=Display&handle=euclid.ijm/1255631807
    var approx_pi = function(limit){
        // Math.ceil(5*x/(4*Math.log(x))) // would be more exact for large x
        return Math.ceil( (LN_113 * limit) / Math.log(limit) ) + 2;
    };
    var approx_limit = function(prime_pi){
        if(prime_pi < 10){
          return 30;
        }
        // see first term of expansion of li(x)-li(2)
        return Math.ceil( prime_pi * ( Math.log( prime_pi * Math.log( prime_pi))));
    };
    var isInt = function(x) {
        if (isNaN(x)) {
            return false;
        }
        if (x > -9007199254740992 && x < 9007199254740992 && Math.floor(
                x) == x) {
            return true;
        }
    };
    var clear = function(where) {
        primesieve[where >>> 5] &= ~((1 << (31 - (where & 31))) );
    };
    var get = function(where) {
        return ((primesieve[where >>> 5] >>> ((31 - (where & 31)))) & 1);
    };
    var nextset = function(from) {
        while (from < primelimit && !get(from)) {
            from++;
        }
        if (from === primelimit && !get(from)) {
            return -1;
        }
        return from;
    };
    var prevset = function(from) {
        while (from >= 0 && !get(from)) {
            from--;
        }
        if (from == 0 && !get(from)) {
            return -1;
        }
        return from;
    };
    var fillsieve = function(n) {
        var k, r, j;
        n = n + 1;
        primelimit = n - 1;
        k = Math.ceil(n / 32);
        buffer = new ArrayBuffer(k * 4);
        primesieve = new Uint32Array(buffer);
        while (k--) {
            primesieve[k] = 0xffffffff;
        }
        clear(0);
        clear(1);
        for (k = 4; k < n; k += 2) {
            clear(k);
        }
        r = Math.floor(Math.sqrt(n));
        k = 0;
        while (k < n) {
            k = nextset(k + 1);
            if (k > r || k < 0) {
                break;
            }
            for (j = k * k; j < n; j += 2 * k) {
                clear(j);
            }
        }
    };
    var E_SUCCESS = 0;
    var E_ARG_NO_INT = 1;
    var E_ARG_TOO_LOW = 2;
    var E_ARG_TOO_HIGH = 3;
    var E_ABOVE_LIMIT = 4;
    Primesieve.error = 0;
    Primesieve.strerror = function(){
        var strerrors = [
            "Success",
            "Argument not an integer",
            "Argument too low",
            "Argument too high",
            "Prime wanted is higher than the limit ",
            "Unknown error"
                        ];
        var e = Primesieve.error;
        if(e == 0){
            return strerrors[ 0 ];
        }
        if(e < 0 || e > strerrors.length - 1){
            return strerrors[ strerrors.length - 1 ];
        }
        if(e == E_ABOVE_LIMIT){
            return strerrors[ E_ABOVE_LIMIT ] + primesizelimit;
        } else {
            return strerrors[e];
        }
    };
    Primesieve.isSmallPrime = function(prime) {
        if (!isInt(prime)) {
            Primesieve.error = E_ARG_NO_INT;
            return undefined;
        } else if (prime < 2 ) {
            Primesieve.error = E_ARG_TOO_LOW;
            return undefined;
        }
        if (prime > primelimit) {
            Primesieve.grow(prime + 100);
            if(Primesieve.error ==  E_ABOVE_LIMIT){
                return undefined;
            }
        }
        Primesieve.error = E_SUCCESS;
        if (get(prime) == 1) {
            return true;
        }
        return false;
    };
    Primesieve.nextPrime = function(prime) {
        if (!isInt(prime)) {
            Primesieve.error = E_ARG_NO_INT;
            return undefined;
        }
        if (prime < 0) {
            return 2;
        }
        if (prime > primelimit) {
            Primesieve.grow(prime + 100);
            if(Primesieve.error ==  E_ABOVE_LIMIT){
                return undefined;
            }
        }
        Primesieve.error = E_SUCCESS;
        return nextset(prime);
    };
    Primesieve.precPrime = function(prime) {
        if (!isInt(prime)) {
            Primesieve.error = E_ARG_NO_INT;
            return undefined;
        } else if (prime < 2 ) {
            Primesieve.error = E_ARG_TOO_LOW;
            return undefined;
        }
        if (prime > primelimit) {
            Primesieve.grow(prime + 100);
            if(Primesieve.error ==  E_ABOVE_LIMIT){
                return undefined;
            }
        }
        Primesieve.error = E_SUCCESS;
        return prevset(prime);
    };
    Primesieve.primePi = function(prime) {
        var k = 0;
        var ct = 0;

        if (!isInt(prime)) {
            Primesieve.error = E_ARG_NO_INT;
            return undefined;
        } else if (prime < 2 ) {
            Primesieve.error = E_ARG_TOO_LOW;
            return undefined;
        }

        if (prime > primelimit) {
            Primesieve.grow(prime + 100);
            if(Primesieve.error ==  E_ABOVE_LIMIT){
                return undefined;
            }
        }
        while (k < prime) {
            k = nextset(k + 1);
            if (k > primelimit || k < 0 || k > prime) {
                break;
            }
            ct++;
        }
        Primesieve.error = E_SUCCESS;
        return ct;
    };
    Primesieve.primePiApprox = function(prime) {
        if (!isInt(prime)) {
            Primesieve.error = E_ARG_NO_INT;
            return undefined;
        } else if (prime < 2 ) {
            Primesieve.error = E_ARG_TOO_LOW;
            return undefined;
        }
        Primesieve.error = E_SUCCESS;
        return approx_pi(prime);
    };
    Primesieve.primeRange = function(low, high) {
        var down = 0,
            up = 0,
            ret = [],
            i = 1;

        if (!isInt(low) || !isInt(high)) {
            Primesieve.error = E_ARG_NO_INT;
            return undefined;
        } else if (low < 0 ) {
            Primesieve.error = E_ARG_TOO_LOW;
            return undefined;
        } else if ( low > high ) {
            /* try again, maybe just a fluke */
            return Primesieve.primeRange(high,low);
        }

        if(primelimit < high){
             Primesieve.grow(high + 100);
            if(Primesieve.error ==  E_ABOVE_LIMIT){
                return undefined;
            }
        }
        down = nextset(low);
        up = prevset(high);
        ret[0] = down;
        if (down == up) {
            return ret;
        }
        while (down < up) {
            down = nextset(down + 1);
            if (down > high || down < 0) {
                break;
            }
            ret[i++] = down;
        }
        Primesieve.error = E_SUCCESS;
        return ret;
    };
    Primesieve.primes = function(prime) {
        var ret, k, count, limit,i;
        limit = approx_limit(prime);

        if (!isInt(prime)) {
            Primesieve.error = E_ARG_NO_INT;
            return undefined;
        } else if (prime < 2) {
            Primesieve.error = E_ARG_TOO_LOW;
            return undefined;
        }

        if(primelimit < limit){
            Primesieve.grow(limit);
            if(Primesieve.error ==  E_ABOVE_LIMIT){
                return undefined;
            }
        }
        ret = [];
        k = 0;
        i = 0;
        count = prime;
        while (count--) {
            k = nextset(k + 1);
            if (k > primelimit || k < 0) {
                break;
            }
            ret[i++] = k;
        }
        Primesieve.error = E_SUCCESS;
        return ret;
    };
    Primesieve.grow = function(alot) {
        if (!isInt(alot)) {
            Primesieve.error = E_ARG_NO_INT;
            return undefined;
        } else if (alot < 2) {
            Primesieve.error = E_ARG_TOO_LOW;
            return undefined;
        } else if (alot > primesizelimit) {
            Primesieve.error = E_ABOVE_LIMIT;
            return undefined;
        } else if(alot > primelimit){
            Primesieve.error = E_SUCCESS;
            fillsieve(alot);
        } /* else {
           Do nothing for now
        }*/
    };
    Primesieve.fill = Primesieve.grow;
    Primesieve.raiseLimit = function(raise) {
        if (!isInt(raise)) {
            Primesieve.error = E_ARG_NO_INT;
            return undefined;
        } else if (raise < 2) {
            Primesieve.error = E_ARG_TOO_LOW;
            return undefined;
        } else if (raise > primesizelimit) {
            Primesieve.error = E_SUCCESS;
            primesizelimit = raise;
        }
    };
    return Primesieve;
})(/* You may place a start-size here */);


var options = {
    "primes"      : 0, // default
    "p"           : 0,
    "prime-pi"    : 1,
    "k"           : 1,
    "approx"      : 2,
    "a"           : 2,
    "next-prime"  : 3,
    "n"           : 3,
    "prec-prime"  : 4,
    "c"           : 4,
    "prime-range" : 5,
    "r"           : 5,
    "set-limit"   : 6,
    "s"           : 6,
    "help"        : 7,
    "h"           : 7,
    "version"     : 8,
    "v"           : 8,
    "delimiter"   : 9,
    "d"           : 9,
    "low"         : 10,
    "l"           : 10,
    "high"        : 11,
    "u"           : 11,
};


function get_option(opt){
    return options[opt];
}

var usage = 
"\nprimesive.js options number\n\n"+
"--primes, -p		prinst 'number' of primes to stdout\n"+
"--prime-pi, -k		the exact number of primes <= 'number'\n"+
"--approx, -a		an approximation of the number of primes <= 'number'\n"+
"--next-prime, -n	the nearest prime > 'number'\n"+
"--prec-prime, -c	the nearest prime < 'number'\n"+
"--prime-range, -r	prints the primes between --high and --low\n"+
"--set-limit, -s	set a limit larger than the safe guard, handle with care."+
"			Must come first on command line to work\n"+
"--help, -h		this message\n"+
"--version, -v		prints the version number\n"+
"--delimiter, -d	set the delimiter between entries in output of --primes\n"+
"--low, -l		set the low bound for --prime-range\n"+
"--high, -u		set the upper bound for --prime-range\n";


var p = primesieve;

var argv = process.argv.slice(2);
var argc = argv.length;

var option,opt;
var value,arg;


if(argc == 0){
    console.log(usage);
    process.exit(1);
}

if(argc === 1){
  arg = argv[0];
  while(arg.charAt(0) == "-"){
      arg = arg.slice(1);
  }
  opt = get_option(arg);
  if(typeof opt === 'undefined'){
    opt = parseInt(arg);
    if(typeof opt === 'undefined'){
         console.log(usage);
    }
    console.log(p.primes(opt).join(","));
    process.exit(0);
  } else {
      switch(opt){
        case 8: console.log(p.version);break;
        default: console.log(usage);break;
      };
      process.exit(0);
  }
}

var number;
var low;
var high;
var delimiter = ",";
var limit;
var f_del = false;
var f_low = false;
var f_hig = false;
var f_num = false;
var f_lim = false;
var func_num;
var to_stdout;
var raise_limit = false;

argv.forEach(function (o) {
    arg = o;
    while(arg.charAt(0) == "-"){
        arg = arg.slice(1);
    }
    opt = options[arg];
    if(typeof opt === 'undefined'){
        if(f_del){
            delimiter = o;
            f_del = false;
        } else if(f_low){
            low = parseInt(o);
            if(isNaN(low)){
               console.log(usage);
               process.exit(1); 
            }
            f_low = false;
        } else if(f_hig){
            high = parseInt(o);
            if(isNaN(high)){
               console.log(usage);
               process.exit(1); 
            }
            f_hig = false;
        } else if(f_lim){
            limit = parseInt(o);
            if(isNaN(limit)){
               console.log(usage);
               process.exit(1); 
            }
            f_lim = false;
        } else {
            number = parseInt(o);
            if(isNaN(number)){
               console.log(usage);
               process.exit(1); 
            }
            f_num = false;
        }
    } else {
        switch(opt){
            case 0 : func_num = 0;
                     break;
            case 1 : func_num = 1;
                     break;
            case 2 : func_num = 2;
                     break;
            case 3 : func_num = 3;
                     break;
            case 4 : func_num = 4;
                     break;
            case 5 : func_num = 5;
                     break;
            case 6 : func_num = 6;raise_limit = true;f_lim = true;
                     break;
            case 7 : console.log(usage); process.exit(0);
                     break;
            case 8 : console.log(version); process.exit(0);
                     break;
            case 9 :  f_del = true;
                     break;
           case 10 : f_low = true;
                     break;
           case 11 : f_hig = true;
                    break;
           default: console.log(usage); process.exit(1);break;
        };
    }
});

if(raise_limit){
    p.raiseLimit(limit);
    if(p.error != 0){
       console.log(p.strerror);
        process.exit(1);   
    }
}

switch(func_num){
    case 0 : to_stdout = p.primes(number).join(delimiter);
             break;
    case 1 : to_stdout = p.primePi(number);
             break;
    case 2 : to_stdout = p.primePiApprox(number);
             break;
    case 3 : to_stdout = p.nextPrime(number);
             break;
    case 4 : to_stdout = p.precPrime(number);
             break;
    case 5 : to_stdout = p.primeRange(low , high).join(delimiter);
             break;
    default: console.log(usage); process.exit(1);
};

if(p.error != 0){
    console.log(p.strerror);
    process.exit(1);
} else {
    console.log(to_stdout);
    process.exit(0);
}

