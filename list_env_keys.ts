console.log(Object.keys(process.env).filter(key => key.includes('KEY') || key.includes('SERVICE') || key.includes('TOTO') || key.includes('DATA')));
