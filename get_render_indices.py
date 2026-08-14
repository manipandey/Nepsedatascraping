with open('app.js.npstocks.bak', 'r') as f:
    js = f.read()

start = js.find('function renderIndices() {')
# find the end of the function. Let's find 'function updateThemeToggle()' which comes after.
end = js.find('function updateThemeToggle()', start)
if end == -1:
    end = js.find('// ---', start)
if end == -1:
    end = js.find('function', start + 10)

func = js[start:end].strip()

with open('app.js', 'a') as f:
    f.write("\n\n" + func + "\n")
print("Appended successfully")
