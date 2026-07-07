CC = gcc

build:
	$(CC) -o bin/app src/main.c

test: build
	./run-tests.sh

lint:
	cppcheck src/

clean:
	rm -rf bin/
