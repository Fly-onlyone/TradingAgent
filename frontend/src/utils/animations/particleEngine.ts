/**
 * Lightweight canvas particle system (~3kb).
 * Renders freely drifting connected particles.
 */

export interface Particle {
	x: number;
	y: number;
	vx: number;
	vy: number;
	opacity: number;
}

export interface ParticleConfig {
	count: number;
	lineDistance: number;
	lineOpacity: number;
	speed: number;
	color: string;
}

export const DEFAULT_CONFIG: ParticleConfig = {
	count: 130,
	lineDistance: 180,
	lineOpacity: 0.28,
	speed: 0.3,
	color: "249, 115, 22",
};

export function createParticles(
	width: number,
	height: number,
	count: number,
	speed: number,
): Particle[] {
	const particles: Particle[] = [];
	for (let i = 0; i < count; i++) {
		particles.push({
			x: Math.random() * width,
			y: Math.random() * height,
			vx: (Math.random() - 0.5) * speed,
			vy: (Math.random() - 0.5) * speed,
			opacity: 0.4 + Math.random() * 0.5,
		});
	}
	return particles;
}

export function updateParticles(
	particles: Particle[],
	width: number,
	height: number,
	dt: number,
) {
	const factor = Math.min(dt / 16, 2); // delta-time normalization, cap at 2x
	for (const p of particles) {
		p.x += p.vx * factor;
		p.y += p.vy * factor;

		// Dampen velocity
		p.vx *= 0.99;
		p.vy *= 0.99;

		// Wrap around edges
		if (p.x < 0) p.x = width;
		if (p.x > width) p.x = 0;
		if (p.y < 0) p.y = height;
		if (p.y > height) p.y = 0;
	}
}

export function drawParticles(
	ctx: CanvasRenderingContext2D,
	particles: Particle[],
	width: number,
	height: number,
	config: ParticleConfig,
) {
	ctx.clearRect(0, 0, width, height);
	const { lineDistance, lineOpacity, color } = config;
	const ld2 = lineDistance * lineDistance;

	// Draw lines between close particles
	for (let i = 0; i < particles.length; i++) {
		for (let j = i + 1; j < particles.length; j++) {
			const a = particles[i];
			const b = particles[j];
			const dx = a.x - b.x;
			const dy = a.y - b.y;
			const d2 = dx * dx + dy * dy;
			if (d2 < ld2) {
				const opacity = lineOpacity * (1 - Math.sqrt(d2) / lineDistance);
				ctx.strokeStyle = `rgba(${color}, ${opacity})`;
				ctx.lineWidth = 1;
				ctx.beginPath();
				ctx.moveTo(a.x, a.y);
				ctx.lineTo(b.x, b.y);
				ctx.stroke();
			}
		}
	}

	// Draw particles
	for (const p of particles) {
		ctx.fillStyle = `rgba(${color}, ${p.opacity})`;
		ctx.beginPath();
		ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
		ctx.fill();
	}
}
