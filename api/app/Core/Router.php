<?php
declare(strict_types=1);

namespace NQ\Core;

final class Router
{
    /** @var list<array{0:string,1:string,2:callable,3:list<string>}> */
    private array $routes = [];

    public function add(string $method, string $pattern, callable $handler): void
    {
        $names = [];
        $regex = preg_replace_callback('/\{([a-z_]+)\}/', static function (array $m) use (&$names): string {
            $names[] = $m[1];
            return '([^/]+)';
        }, $pattern);
        $this->routes[] = [$method, '#^' . $regex . '$#', $handler, $names];
    }

    public function get(string $p, callable $h): void { $this->add('GET', $p, $h); }
    public function post(string $p, callable $h): void { $this->add('POST', $p, $h); }
    public function put(string $p, callable $h): void { $this->add('PUT', $p, $h); }
    public function patch(string $p, callable $h): void { $this->add('PATCH', $p, $h); }
    public function delete(string $p, callable $h): void { $this->add('DELETE', $p, $h); }

    /** @return array{0:callable,1:array<string,string>} */
    public function match(string $method, string $path): array
    {
        $allowed = [];
        $lookup = $method === 'HEAD' ? 'GET' : $method;
        foreach ($this->routes as [$m, $regex, $handler, $names]) {
            if (!preg_match($regex, $path, $mm)) {
                continue;
            }
            if ($m !== $lookup) {
                $allowed[] = $m;
                continue;
            }
            array_shift($mm);
            return [$handler, $names === [] ? [] : array_combine($names, $mm)];
        }
        if ($allowed !== []) {
            throw new ApiError(405, 'method_not_allowed', null, [], ['Allow' => implode(', ', array_unique($allowed))]);
        }
        throw ApiError::notFound('المسار غير موجود.');
    }
}
